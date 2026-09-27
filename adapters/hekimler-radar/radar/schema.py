from __future__ import annotations

from typing import Any

RECOMMENDED_FORMATS = {"carousel", "story", "static", "reel", "none"}

# CLAUDE.md'deki "Claude çıktısı" şemasıyla birebir eşleşir. Her alan
# bulunmalı (değeri null/boş olabilir); tip uyuşmazlığı veya eksik alan
# hata sayılır ki Claude'un uydurduğu/bozuk çıktı sessizce veritabanına
# yazılmasın, deterministik fallback devreye girsin.
REQUIRED_STRING_OR_NULL = (
    "institution", "faculty", "category", "event_date", "deadline",
    "student_year", "city", "fee", "eligibility",
)
REQUIRED_LIST_OF_STR = ("external_facts", "risk_flags")


def validate_claude_output(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["Kök öğe JSON nesnesi değil"]

    for field in ("title", "summary"):
        value = data.get(field)
        if field not in data:
            errors.append(f"'{field}' alanı eksik")
        elif not isinstance(value, str) or not value.strip():
            errors.append(f"'{field}' boş olmayan bir metin olmalı")

    for field in REQUIRED_STRING_OR_NULL:
        if field not in data:
            errors.append(f"'{field}' alanı eksik")
        elif data[field] is not None and not isinstance(data[field], str):
            errors.append(f"'{field}' metin veya null olmalı")

    for field in REQUIRED_LIST_OF_STR:
        if field not in data:
            errors.append(f"'{field}' alanı eksik")
        else:
            value = data[field]
            if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
                errors.append(f"'{field}' metin listesi olmalı")

    if "recommended_format" not in data:
        errors.append("'recommended_format' alanı eksik")
    elif data["recommended_format"] not in RECOMMENDED_FORMATS:
        errors.append(f"'recommended_format' şunlardan biri olmalı: {sorted(RECOMMENDED_FORMATS)}")

    for field in ("urgency_score", "confidence_score"):
        if field not in data:
            errors.append(f"'{field}' alanı eksik")
        else:
            value = data[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                errors.append(f"'{field}' sayısal olmalı")
            elif not (0 <= value <= 100):
                errors.append(f"'{field}' 0-100 aralığında olmalı")

    if "human_review_required" not in data:
        errors.append("'human_review_required' alanı eksik")
    elif not isinstance(data["human_review_required"], bool):
        errors.append("'human_review_required' boolean olmalı")

    for field in ("draft_hook", "draft_caption"):
        if field not in data:
            errors.append(f"'{field}' alanı eksik")
        elif data[field] is not None and not isinstance(data[field], str):
            errors.append(f"'{field}' metin veya null olmalı")

    return errors
