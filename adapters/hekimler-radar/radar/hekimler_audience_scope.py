"""Universal Hekimler audience gate (policy: content/policies/hekimler-audience-scope.json).

An item is in scope only if its text concerns physicians, dentists, veterinarians
or their students/candidates, or a named medical exam/pathway. Weak generic terms
(burs, exchange, Erasmus, language exams) count only together with a profession term.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .hekimler_registry import _fold, _keyword_hit

_POLICY = Path(__file__).resolve().parents[1] / "content" / "policies" / "hekimler-audience-scope.json"


@lru_cache(maxsize=1)
def load_scope_policy() -> dict[str, Any]:
    return json.loads(_POLICY.read_text(encoding="utf-8"))


def is_audience_native(source_id: str) -> bool:
    return source_id in set(load_scope_policy().get("audienceNativeSources") or [])


def audience_scope_hits(text: str) -> list[str]:
    pol = load_scope_policy()
    weak = {_fold(t) for t in pol.get("weakTermsRequireProfessionContext") or []}
    strong: list[str] = []
    weak_hits: list[str] = []
    for terms in (pol.get("scopeTerms") or {}).values():
        for term in terms:
            if _keyword_hit(text, term):
                (weak_hits if _fold(term) in weak else strong).append(term)
    # Weak terms only count alongside a profession/learner/pathway term.
    return strong


def in_audience_scope(source_id: str, title: str, body: str = "") -> tuple[bool, list[str]]:
    if is_audience_native(source_id):
        return True, ["audience_native_source"]
    hits = audience_scope_hits(f"{title}\n{body}")
    return bool(hits), hits


def health_system_layer_hits(source_id: str, title: str, body: str = "") -> list[str]:
    """Indirect-impact layer: official sources only; item enters the pipeline directly."""
    layer = load_scope_policy().get("healthSystemLayer") or {}
    if source_id not in set(layer.get("sources") or []):
        return []
    text = title + " " + body
    return [t for t in layer.get("terms") or [] if _keyword_hit(text, t)]
