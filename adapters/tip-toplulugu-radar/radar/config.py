from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    root: Path = ROOT
    db_path: Path = ROOT / os.getenv("RADAR_DB_PATH", "database/radar.sqlite")
    sources_path: Path = ROOT / "sources" / "official_sources.yaml"
    use_claude: bool = os.getenv("RADAR_USE_CLAUDE", "0") == "1"
    claude_model: str = os.getenv("RADAR_CLAUDE_MODEL", "claude-haiku-4-5")
    user_agent: str = os.getenv(
        "RADAR_USER_AGENT", "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
    )
    timeout_seconds: int = 30


settings = Settings()

