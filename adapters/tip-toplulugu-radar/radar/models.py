from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Source:
    id: str
    name: str
    institution: str
    category: str
    url: str
    source_type: str = "html"
    faculty: str | None = None
    official: bool = True
    enabled: bool = True
    check_every_minutes: int = 1440
    content_selector: str | None = None


@dataclass
class FetchResult:
    source: Source
    content: str
    content_hash: str
    fetched_at: str
    status_code: int
    title: str = ""


@dataclass
class Candidate:
    source_id: str
    source_url: str
    institution: str
    category: str
    title: str
    summary: str
    content_hash: str
    faculty: str | None = None
    event_date: str | None = None
    deadline: str | None = None
    # Editoryal ekrana zorunlu alanlar (2026-08-31 kararı). Kaynaktan
    # doğrulanamayan alan null kalır; asla tahminle doldurulmaz.
    student_year: str | None = None  # sınıf/dönem
    city: str | None = None  # şehir
    fee: str | None = None  # ücret
    eligibility: str | None = None  # uygunluk koşulları
    urgency_score: int = 40
    confidence_score: int = 60
    recommended_format: str = "carousel"
    external_facts: list[str] = field(default_factory=list)
    risk_flags: list[str] = field(default_factory=list)
    human_review_required: bool = True
    draft_hook: str = ""
    draft_caption: str = ""
    raw_analysis: dict[str, Any] = field(default_factory=dict)

