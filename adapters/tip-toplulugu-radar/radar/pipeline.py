from __future__ import annotations

import copy
import hashlib

from .analyzer import claude_candidate, deterministic_candidate
from .audience import (
    classify_for_queue,
    extract_exam_cycle_key,
    extract_gazette_items,
    extract_notice_titles,
)
from .config import Settings
from .database import Database
from .deadlines import deadline_risk_flag, deadline_urgency_boost, days_until
from .fetchers import fetch
from .models import Candidate, Source
from .sources import load_sources


# "Değişiklik" duyurusu — mevcut bir başvurunun tarih uzatımı, iptali, ücret
# veya uygunluk şartı değişikliği — bir "yeni duyuru"dan daha yüksek
# öncelik almalı: öğrenci muhtemelen kaçırmamalı (2026-08-31 kararı).
CHANGE_NOTICE_MARKERS = (
    "ek süre", "süre uzat", "uzatıldı", "uzatılmıştır", "yeniden",
    "iptal edil", "ertelendi", "ertelenmiştir", "değişiklik yapılmasına",
    "değiştirilmiştir", "güncellendi", "düzeltme", "sehven",
    # Ders kurulu / staj sınav tarihinin değişmesi tıp öğrencisi için en
    # kritik duyuru türü; "değişiklik yapılmasına" kalıbı bunu kaçırıyordu
    # ("... Sınav Tarihi Değişikliği" gibi başlıklar) — 2026-09-01.
    "değişikliği", "değişikliğ", "tarihi değiş", "saati değiş", "yeri değiş",
)
CHANGE_NOTICE_URGENCY_BOOST = 15


def _apply_change_priority(candidate: Candidate) -> None:
    blob = f"{candidate.title} {candidate.summary}".lower()
    if any(marker in blob for marker in CHANGE_NOTICE_MARKERS):
        candidate.urgency_score = min(100, candidate.urgency_score + CHANGE_NOTICE_URGENCY_BOOST)
        if "change_notice" not in candidate.risk_flags:
            candidate.risk_flags.append("change_notice")


def _apply_deadline_urgency(candidate: Candidate) -> None:
    remaining = days_until(candidate.deadline)
    if remaining is None:
        return
    candidate.urgency_score = min(100, candidate.urgency_score + deadline_urgency_boost(remaining))
    flag = deadline_risk_flag(remaining)
    if flag and flag not in candidate.risk_flags:
        candidate.risk_flags.append(flag)


def _item_candidate(base: Candidate, title: str) -> Candidate:
    item = copy.copy(base)
    item.title = title
    item.summary = title
    item.draft_hook = title
    digest = hashlib.sha256(f"{base.source_id}:{title}".encode("utf-8")).hexdigest()
    item.content_hash = digest
    return item


# YÖK'ün ayrı bir "Genel Kurul / Yürütme Kurulu kararları" sayfası yok —
# bu kararlar yok_duyurular kaynağının genel duyuru akışında yayımlanıyor.
# Ayrı bir kaynak eklemek yerine (uydurma URL yasak), bu tür maddeler
# başlıklarından tanınıp etiketleniyor (2026-08-31 kararı).
GENEL_KURUL_MARKERS = ("genel kurul", "yürütme kurulu karar", "yurutme kurulu karar")


def _tag_genel_kurul(candidate: Candidate) -> None:
    blob = candidate.title.lower()
    if any(marker in blob for marker in GENEL_KURUL_MARKERS) and "genel_kurul_karari" not in candidate.risk_flags:
        candidate.risk_flags.append("genel_kurul_karari")


def _apply_audience(candidate: Candidate, source: Source, page_title: str, page_body: str) -> list[Candidate]:
    if source.category == "legislation":
        notices = extract_gazette_items(page_body)
    else:
        notices = extract_notice_titles(page_body)
    if len(notices) >= 2:
        kept: list[Candidate] = []
        for title in notices:
            decision = classify_for_queue(source.category, title, "")
            if decision.enqueue:
                item = _item_candidate(candidate, title)
                item.risk_flags = list(item.risk_flags) + [f"audience_{decision.tier}", decision.reason]
                item.raw_analysis = {**item.raw_analysis, "audience_tier": decision.tier}
                _tag_genel_kurul(item)
                kept.append(item)
        return kept
    decision = classify_for_queue(source.category, page_title, page_body)
    if not decision.enqueue:
        return []
    candidate.risk_flags = list(candidate.risk_flags) + [f"audience_{decision.tier}", decision.reason]
    candidate.raw_analysis = {**candidate.raw_analysis, "audience_tier": decision.tier}
    _tag_genel_kurul(candidate)
    return [candidate]


def run(settings: Settings, only_source: str | None = None) -> dict[str, int]:
    db = Database(settings.db_path)
    db.init()
    stats = {"checked": 0, "changed": 0, "candidates": 0, "errors": 0, "skipped_audience": 0}
    sources = load_sources(settings.sources_path)
    for source in sources:
        if not source.enabled or (only_source and source.id != only_source):
            continue
        stats["checked"] += 1
        try:
            previous = db.latest_snapshot(source.id)
            result = fetch(source, settings.user_agent, settings.timeout_seconds)
            changed = previous is None or previous["content_hash"] != result.content_hash
            db.save_snapshot(result)
            if not changed:
                db.log("info", "Değişiklik yok", source.id)
                continue
            stats["changed"] += 1
            if settings.use_claude:
                try:
                    candidate = claude_candidate(result, settings.claude_model)
                except Exception as exc:
                    db.log("warning", f"Claude analizi başarısız; fallback: {exc}", source.id)
                    candidate = deterministic_candidate(result, changed=True)
                    candidate.risk_flags.append("claude_fallback")
            else:
                candidate = deterministic_candidate(result, changed=True)
            _apply_deadline_urgency(candidate)
            _apply_change_priority(candidate)
            queued = _apply_audience(candidate, source, result.title, result.content)
            if not queued:
                stats["skipped_audience"] += 1
                db.log("info", "Kademe filtresi: öğrenci kuyruğuna alınmadı", source.id)
                continue
            saved = 0
            for item in queued:
                new_id = db.save_candidate(item)
                if not new_id:
                    continue
                saved += 1
                related = list(db.find_related(item.title, item.source_id))
                cycle_key = extract_exam_cycle_key(item.title)
                if cycle_key:
                    seen_ids = {row["id"] for row in related}
                    for row in db.find_by_exam_cycle(cycle_key, new_id):
                        if row["id"] not in seen_ids:
                            related.append(row)
                            seen_ids.add(row["id"])
                if related:
                    db.set_related(new_id, [row["id"] for row in related])
                    for row in related:
                        db.add_related(row["id"], new_id)
                    db.log(
                        "info",
                        f"Çapraz kaynak/sınav döngüsü eşleşmesi: {len(related)} ilişkili aday bulundu",
                        item.source_id,
                    )
            stats["candidates"] += saved
            if saved:
                db.log("info", "Yeni/değişen içerik kaydedildi", source.id)
            else:
                db.log("info", "Kademe sonrası tekrarlı aday", source.id)
        except Exception as exc:
            stats["errors"] += 1
            db.log("error", str(exc), source.id)
    return stats
