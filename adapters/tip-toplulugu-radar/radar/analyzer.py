from __future__ import annotations

import json
import re
import shutil
import subprocess
from datetime import datetime
from typing import Any

from .models import Candidate, FetchResult
from .schema import validate_claude_output


DATE_RE = re.compile(r"\b([0-3]?\d[./-][01]?\d[./-](?:20)?\d{2})\b")


def _first_date(text: str) -> str | None:
    match = DATE_RE.search(text)
    return match.group(1) if match else None


def deterministic_candidate(result: FetchResult, changed: bool) -> Candidate:
    date = _first_date(result.content)
    summary = result.content[:500] + ("…" if len(result.content) > 500 else "")
    confidence = 78 if result.source.official else 45
    risk_flags = [] if result.source.official else ["non_official_source"]
    if not date:
        risk_flags.append("date_not_detected")
    urgency = 55 if changed else 25
    return Candidate(
        source_id=result.source.id,
        source_url=result.source.url,
        institution=result.source.institution,
        category=result.source.category,
        title=result.title or result.source.name,
        summary=summary,
        content_hash=result.content_hash,
        event_date=date,
        urgency_score=urgency,
        confidence_score=confidence,
        external_facts=[summary],
        risk_flags=risk_flags,
        human_review_required=True,
        draft_hook=f"{result.source.institution} tarafından yeni bir güncelleme yayımlandı.",
        draft_caption="Kaynak kontrolü ve editoryal onay sonrasında hazırlanacaktır.",
    )


_FENCE_RE = re.compile(r"```(?:json)?\s*(.+?)\s*```", re.S)


def extract_json(raw: str) -> Any:
    """Pull the JSON payload out of Claude's answer.

    Claude often explains its reasoning before emitting the JSON ("Bu ÖSYM
    sayfası bir arşiv listesi... Aşağıda en yeni duyuruyu veriyorum:"), so
    the old check — strip fences only when the output STARTS with ``` —
    left prose in front of the payload and json.loads() failed on every
    such answer. Look for a fenced block anywhere, else fall back to the
    outermost {...} / [...] span.

    A list is accepted and its first element used: on index pages Claude
    returns one object per announcement, newest first, and the newest is
    the one the diff actually flagged as new.
    """
    text = (raw or "").strip()
    if not text:
        raise ValueError("Claude boş çıktı verdi")

    candidates: list[str] = [match.group(1) for match in _FENCE_RE.finditer(text)]
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = text.find(opener), text.rfind(closer)
        if start != -1 and end > start:
            candidates.append(text[start : end + 1])

    for snippet in candidates:
        try:
            data = json.loads(snippet)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            if not data:
                continue
            data = data[0]
        return data
    raise ValueError("Claude çıktısından JSON çıkarılamadı")


def claude_candidate(result: FetchResult, model: str) -> Candidate:
    instruction = """Sana stdin ile bir RESMÎ KAYNAK metni veriliyor. Onu analiz et
ve YALNIZCA geçerli JSON döndür. Bilgi uydurma; metinde bulunmayan alanı
null/boş bırak. Tarih ve şartları metinden aynen çıkar.

Şema: title, summary, institution, faculty, category, event_date, deadline,
student_year(sınıf/dönem, ör. "Dönem 3" veya null), city(şehir veya null),
fee(ücret/harç, metinden aynen, ör. "1250 TL" veya null),
eligibility(uygunluk koşulları, kısa metin veya null),
external_facts(array), recommended_format, urgency_score(0-100),
confidence_score(0-100), human_review_required(boolean), risk_flags(array),
draft_hook, draft_caption."""
    source_text = (
        f"Kaynak: {result.source.url}\n"
        f"Kurum: {result.source.institution}\n"
        f"Kategori: {result.source.category}\n"
        f"Metin:\n{result.content[:30000]}"
    )
    # Windows'ta npm ile kurulan CLI'lar .CMD shim'idir ve subprocess bunu
    # PATH'ten kendi başına çözemez ("[WinError 2] dosya bulunamıyor").
    executable = shutil.which("claude")
    if not executable:
        raise FileNotFoundError("claude CLI bulunamadı (PATH'te yok)")
    # Kaynak metni argüman olarak DEĞİL stdin ile geçilir: Windows komut
    # satırı ~32K ile sınırlı ve 30K'lık sayfa metni bu sınırı aşınca
    # süreç sessizce rc=1 + boş çıktı veriyordu; hata pipeline'daki
    # fallback tarafından yutulduğu için Claude analizi hiç çalışmamıştı.
    completed = subprocess.run(
        [executable, "-p", instruction, "--model", model, "--output-format", "text"],
        input=source_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
        check=True,
    )
    data = extract_json(completed.stdout)
    errors = validate_claude_output(data)
    if errors:
        raise ValueError(f"Claude çıktısı şemaya uymuyor: {'; '.join(errors)}")
    return Candidate(
        source_id=result.source.id,
        source_url=result.source.url,
        institution=data.get("institution") or result.source.institution,
        category=data.get("category") or result.source.category,
        title=data.get("title") or result.title,
        summary=data.get("summary") or "",
        content_hash=result.content_hash,
        faculty=data.get("faculty"),
        event_date=data.get("event_date"),
        deadline=data.get("deadline"),
        student_year=data.get("student_year"),
        city=data.get("city"),
        fee=data.get("fee"),
        eligibility=data.get("eligibility"),
        urgency_score=max(0, min(100, int(data.get("urgency_score", 50)))),
        confidence_score=max(0, min(100, int(data.get("confidence_score", 50)))),
        recommended_format=data.get("recommended_format") or "carousel",
        external_facts=data.get("external_facts") or [],
        risk_flags=data.get("risk_flags") or [],
        human_review_required=bool(data.get("human_review_required", True)),
        draft_hook=data.get("draft_hook") or "",
        draft_caption=data.get("draft_caption") or "",
        raw_analysis=data,
    )

