"""Hekimler Burs lane — registry load + official-funding gate.

Additive burs_* sources. No queue writes. Hub partition stays hekimler_phase1.
Staj / prestige-course lanes are out of this module.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "content" / "source-registry-burs-v1.json"
POLICY_PATH = ROOT / "content" / "policies" / "hekimler-burs-policy.json"
POOL_PATH = ROOT / "content" / "burs" / "pool.json"

BURS_PREFIX = "burs_"

BURS_ACCEPT_KEYWORDS = (
    "burs",
    "scholarship",
    "fellowship",
    "stipend",
    "grant",
    "fully funded",
    "fully-funded",
    "başvuru",
    "son başvuru",
    "application deadline",
    "call for application",
    "call for applications",
)

BURS_DISCARD_KEYWORDS = (
    "garanti kabul",
    "easy pathway",
    "best medical school ranking",
    "consultancy",
    "immigration package",
    "recruiter",
)


def load_burs_registry() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {"sources": []}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def load_burs_policy() -> dict[str, Any]:
    if not POLICY_PATH.exists():
        return {}
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def load_burs_pool() -> dict[str, Any]:
    if not POOL_PATH.exists():
        return {"source_registry": [], "burs_ilanlari": []}
    return json.loads(POOL_PATH.read_text(encoding="utf-8"))


def is_burs_source_id(source_id: str | None) -> bool:
    return bool(source_id) and str(source_id).startswith(BURS_PREFIX)


def burs_gate(title: str, body: str = "") -> tuple[str, str]:
    """Return (ACCEPT|DISCARD, reason) for a burs-lane item."""
    blob = f"{title} {body}".lower()
    if any(k in blob for k in BURS_DISCARD_KEYWORDS):
        return "DISCARD", "burs_discard_signal"
    if any(k in blob for k in BURS_ACCEPT_KEYWORDS):
        return "ACCEPT", "burs_opportunity_signal"
    return "DISCARD", "no_burs_signal"
