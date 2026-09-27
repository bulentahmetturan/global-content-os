"""Hekimler Eğitim lane — prestige course / CME / academy registry.

Additive egitim_* sources. No queue writes. Hub partition stays hekimler_phase1.
Scholarship/fellowship funding stays in burs_; unpaid short staj stays out.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "content" / "source-registry-egitim-v1.json"
POLICY_PATH = ROOT / "content" / "policies" / "hekimler-egitim-policy.json"
POOL_PATH = ROOT / "content" / "egitim" / "pool.json"

EGITIM_PREFIX = "egitim_"

EGITIM_ACCEPT_KEYWORDS = (
    "kurs",
    "course",
    "cme",
    "cpd",
    "masterclass",
    "summer school",
    "yaz okulu",
    "academy",
    "e-learning",
    "elearning",
    "observership",
    "preceptorship",
    "fellowship programme",
    "training programme",
    "eğitim programı",
    "certification",
    "sertifika",
)

EGITIM_DISCARD_KEYWORDS = (
    "garanti kabul",
    "consultancy",
    "course mill",
    "aggregator",
)


def load_egitim_registry() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {"sources": []}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def load_egitim_policy() -> dict[str, Any]:
    if not POLICY_PATH.exists():
        return {}
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def load_egitim_pool() -> dict[str, Any]:
    if not POOL_PATH.exists():
        return {"source_registry": [], "egitim_ilanlari": []}
    return json.loads(POOL_PATH.read_text(encoding="utf-8"))


def is_egitim_source_id(source_id: str | None) -> bool:
    return bool(source_id) and str(source_id).startswith(EGITIM_PREFIX)


def egitim_gate(title: str, body: str = "") -> tuple[str, str]:
    blob = f"{title} {body}".lower()
    if any(k in blob for k in EGITIM_DISCARD_KEYWORDS):
        return "DISCARD", "egitim_discard_signal"
    if any(k in blob for k in EGITIM_ACCEPT_KEYWORDS):
        return "ACCEPT", "egitim_training_signal"
    return "DISCARD", "no_egitim_signal"
