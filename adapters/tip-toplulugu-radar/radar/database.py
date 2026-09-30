from __future__ import annotations

import difflib
import json
import sqlite3
from pathlib import Path
from typing import Any

# Farklı kaynaklarda aynı duyurunun tekrarını yakalamak için başlık benzerlik
# eşiği. Kısa/genel başlıklarda (ör. "Duyurular", "Tıp Fakültesi") yanlış
# eşleşmeyi önlemek için minimum uzunluk şartı da aranır.
RELATED_TITLE_MIN_LENGTH = 25
RELATED_TITLE_SIMILARITY_THRESHOLD = 0.8


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  UNIQUE(source_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_source_time
  ON snapshots(source_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  institution TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  faculty TEXT,
  event_date TEXT,
  deadline TEXT,
  student_year TEXT,
  city TEXT,
  fee TEXT,
  eligibility TEXT,
  urgency_score INTEGER NOT NULL,
  confidence_score INTEGER NOT NULL,
  recommended_format TEXT NOT NULL,
  external_facts_json TEXT NOT NULL,
  risk_flags_json TEXT NOT NULL,
  human_review_required INTEGER NOT NULL,
  draft_hook TEXT NOT NULL,
  draft_caption TEXT NOT NULL,
  raw_analysis_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  related_ids_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY,
  source_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


class Database:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def init(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(candidates)")}
            if "related_ids_json" not in columns:
                conn.execute("ALTER TABLE candidates ADD COLUMN related_ids_json TEXT NOT NULL DEFAULT '[]'")
            for extra_column in ("faculty", "student_year", "city", "fee", "eligibility"):
                if extra_column not in columns:
                    conn.execute(f"ALTER TABLE candidates ADD COLUMN {extra_column} TEXT")

    def latest_snapshot(self, source_id: str) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM snapshots WHERE source_id=? ORDER BY fetched_at DESC LIMIT 1",
                (source_id,),
            ).fetchone()

    def save_snapshot(self, result: Any) -> bool:
        try:
            with self.connect() as conn:
                conn.execute(
                    """INSERT INTO snapshots
                    (source_id,source_url,title,content,content_hash,fetched_at,status_code)
                    VALUES (?,?,?,?,?,?,?)""",
                    (
                        result.source.id, result.source.url, result.title, result.content,
                        result.content_hash, result.fetched_at, result.status_code,
                    ),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def save_candidate(self, candidate: Any) -> int | None:
        try:
            with self.connect() as conn:
                cursor = conn.execute(
                    """INSERT INTO candidates
                    (source_id,source_url,institution,category,title,summary,content_hash,
                     faculty,event_date,deadline,student_year,city,fee,eligibility,
                     urgency_score,confidence_score,recommended_format,
                     external_facts_json,risk_flags_json,human_review_required,draft_hook,
                     draft_caption,raw_analysis_json)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        candidate.source_id, candidate.source_url, candidate.institution,
                        candidate.category, candidate.title, candidate.summary,
                        candidate.content_hash, candidate.faculty, candidate.event_date,
                        candidate.deadline, candidate.student_year, candidate.city,
                        candidate.fee, candidate.eligibility,
                        candidate.urgency_score, candidate.confidence_score,
                        candidate.recommended_format,
                        json.dumps(candidate.external_facts, ensure_ascii=False),
                        json.dumps(candidate.risk_flags, ensure_ascii=False),
                        int(candidate.human_review_required), candidate.draft_hook,
                        candidate.draft_caption,
                        json.dumps(candidate.raw_analysis, ensure_ascii=False),
                    ),
                )
            return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None

    def find_related(self, title: str, exclude_source_id: str, limit: int = 300) -> list[sqlite3.Row]:
        title = (title or "").strip()
        if len(title) < RELATED_TITLE_MIN_LENGTH:
            return []
        normalized = title.lower()
        with self.connect() as conn:
            rows = conn.execute(
                """SELECT id, source_id, title FROM candidates
                   WHERE source_id != ? AND status != 'rejected'
                   ORDER BY created_at DESC LIMIT ?""",
                (exclude_source_id, limit),
            ).fetchall()
        matches = []
        for row in rows:
            other_title = (row["title"] or "").strip()
            if len(other_title) < RELATED_TITLE_MIN_LENGTH:
                continue
            ratio = difflib.SequenceMatcher(None, normalized, other_title.lower()).ratio()
            if ratio >= RELATED_TITLE_SIMILARITY_THRESHOLD:
                matches.append(row)
        return matches

    def find_by_exam_cycle(self, exam_cycle_key: str, exclude_id: int, limit: int = 500) -> list[sqlite3.Row]:
        """Aynı sınav döngüsünün (ör. '2026-tus 1. dönem') farklı aşama
        duyurularını (kılavuz/giriş belgesi/sonuç/yerleştirme) bulur.
        find_related'ın genel başlık benzerliği bu aşamaları çoğu zaman
        yakalayamaz çünkü ortak önek dışındaki metin çok farklılaşır."""
        from .audience import extract_exam_cycle_key

        with self.connect() as conn:
            rows = conn.execute(
                """SELECT id, source_id, title FROM candidates
                   WHERE id != ? AND status != 'rejected'
                   ORDER BY created_at DESC LIMIT ?""",
                (exclude_id, limit),
            ).fetchall()
        return [row for row in rows if extract_exam_cycle_key(row["title"]) == exam_cycle_key]

    def set_related(self, candidate_id: int, related_ids: list[int]) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE candidates SET related_ids_json=? WHERE id=?",
                (json.dumps(sorted(set(related_ids))), candidate_id),
            )

    def add_related(self, candidate_id: int, other_id: int) -> None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT related_ids_json FROM candidates WHERE id=?", (candidate_id,)
            ).fetchone()
            if row is None:
                return
            ids = set(json.loads(row["related_ids_json"] or "[]"))
            ids.add(other_id)
            conn.execute(
                "UPDATE candidates SET related_ids_json=? WHERE id=?",
                (json.dumps(sorted(ids)), candidate_id),
            )

    def list_candidates(self, limit: int = 100) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                "SELECT * FROM candidates ORDER BY urgency_score DESC, created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()

    def list_recent(self, hours: int = 24) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                """SELECT * FROM candidates WHERE created_at >= datetime('now', ?)
                   ORDER BY urgency_score DESC, created_at DESC""",
                (f"-{hours} hours",),
            ).fetchall()

    def set_status(self, candidate_id: int, status: str) -> None:
        if status not in {"approved", "rejected", "review"}:
            raise ValueError("Geçersiz durum")
        with self.connect() as conn:
            conn.execute(
                "UPDATE candidates SET status=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?",
                (status, candidate_id),
            )

    def source_health(self) -> dict[str, dict[str, Any]]:
        health: dict[str, dict[str, Any]] = {}
        with self.connect() as conn:
            for row in conn.execute(
                """SELECT source_id, MAX(fetched_at) AS last_success_at,
                          status_code AS last_status_code
                   FROM snapshots GROUP BY source_id"""
            ):
                health.setdefault(row["source_id"], {})["last_success_at"] = row["last_success_at"]
                health[row["source_id"]]["last_status_code"] = row["last_status_code"]
            for row in conn.execute(
                """SELECT source_id, MAX(created_at) AS last_error_at, message
                   FROM run_logs WHERE level='error' GROUP BY source_id"""
            ):
                entry = health.setdefault(row["source_id"], {})
                entry["last_error_at"] = row["last_error_at"]
                entry["last_error_message"] = row["message"]
            for row in conn.execute(
                """SELECT source_id, MAX(created_at) AS last_checked_at
                   FROM run_logs GROUP BY source_id"""
            ):
                health.setdefault(row["source_id"], {})["last_checked_at"] = row["last_checked_at"]
        return health

    def log(self, level: str, message: str, source_id: str | None = None) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO run_logs(source_id,level,message) VALUES (?,?,?)",
                (source_id, level, message[:2000]),
            )

