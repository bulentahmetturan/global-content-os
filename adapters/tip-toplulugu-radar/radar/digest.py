from __future__ import annotations

from .database import Database
from .deadlines import days_until


def build_digest(db: Database, hours: int = 24) -> str:
    rows = db.list_recent(hours)
    if not rows:
        return f"Son {hours} saatte yeni içerik adayı yok."

    by_category: dict[str, list] = {}
    for row in rows:
        by_category.setdefault(row["category"], []).append(row)

    lines = [f"# Editoryal Özet — Son {hours} Saat", "", f"Toplam {len(rows)} yeni aday.", ""]
    for category in sorted(by_category):
        items = by_category[category]
        lines.append(f"## {category} ({len(items)})")
        for row in items:
            remaining = days_until(row["deadline"])
            if remaining is None:
                deadline_note = ""
            elif remaining < 0:
                deadline_note = " — son tarih geçti"
            else:
                deadline_note = f" — son {remaining} gün"
            lines.append(
                f"- **{row['title']}** ({row['institution']}) · "
                f"Aciliyet {row['urgency_score']}/100 · Durum: {row['status']}{deadline_note}"
            )
            lines.append(f"  {row['source_url']}")
        lines.append("")
    return "\n".join(lines)
