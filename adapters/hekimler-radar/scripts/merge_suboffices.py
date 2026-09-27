"""Convert a confirmed sub-office probe report into official_sources.yaml
entries. Only rows already keyword-verified by discover_university_suboffices
are used — this script does not fetch or guess anything new.

SKS / Erasmus / Kariyer Merkezi are given category "faculty_announcement"
(same generous default-to-A behavior as the medical faculty pages, since
their content is inherently student-facing). BAP / TTO get the stricter
"central_announcement" (no default override) since their content is mostly
faculty/researcher grant and tech-transfer material, not student agenda —
the audience filter should default those to "out" unless a specific item
actually mentions students.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_faculty_urls import FACULTIES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "sources" / "_suboffice_probe_report.json"
SOURCES_FILE = ROOT / "sources" / "official_sources.yaml"

OFFICE_CATEGORY = {
    "sks": "faculty_announcement",
    "erasmus": "faculty_announcement",
    "kariyer": "faculty_announcement",
    "bap": "central_announcement",
    "tto": "central_announcement",
    "ogrenci_isleri": "faculty_announcement",
    "kutuphane": "faculty_announcement",
    "hastane": "central_announcement",
    "etik_kurul": "central_announcement",
    "surekli_egitim": "central_announcement",
    "burs_ofisi": "scholarship_research",
    "arastirma_merkezleri": "faculty_announcement",
}
OFFICE_NAME_SUFFIX = {
    "sks": "Sağlık Kültür ve Spor Daire Başkanlığı",
    "erasmus": "Uluslararası İlişkiler / Erasmus Ofisi",
    "kariyer": "Kariyer Merkezi",
    "bap": "Bilimsel Araştırma Projeleri Koordinatörlüğü (BAP)",
    "ogrenci_isleri": "Öğrenci İşleri / Öğrenci Dekanlığı",
    "kutuphane": "Kütüphane",
    "hastane": "Üniversite Hastanesi",
    "etik_kurul": "Klinik Araştırmalar Etik Kurulu",
    "surekli_egitim": "Sürekli Eğitim Merkezi",
    "burs_ofisi": "Burs ve Öğrenci Destek Ofisi",
    "arastirma_merkezleri": "Araştırma ve Uygulama Merkezleri",
    "tto": "Teknoloji Transfer Ofisi (TTO)",
}


def _yaml_str(value: str) -> str:
    # yaml.dump() appends a stray "\n..." document-end marker for bare
    # scalars, which would corrupt hand-appended lines — always single-quote
    # instead (safe for any Turkish text; only literal single quotes need
    # doubling per YAML's own escaping rule).
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    report_path = Path(sys.argv[1]) if len(sys.argv) > 1 else REPORT
    report = json.loads(report_path.read_text(encoding="utf-8"))
    institutions = {u["id"]: u["institution"] for u in FACULTIES}

    # Text-append only: the file is hand-annotated with inline comments
    # (SSL whitelist notes, {today} placeholder explanation, disabled-source
    # reasons, etc.) that a yaml.safe_load()/yaml.dump() round-trip would
    # silently discard. Existing ids are read once for dedupe, but the file
    # itself is never re-serialized.
    with open(SOURCES_FILE, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    existing_ids = {s["id"] for s in data["sources"]}

    lines = ["\n# --- Üniversite alt birim sayfaları (SKS/Erasmus/BAP/TTO/Kariyer),",
             "# scripts/discover_university_suboffices.py ile keşfedilip anahtar",
             "# kelime eşleşmesiyle doğrulandı, scripts/merge_suboffices.py ile eklendi."]
    added = 0
    skipped = 0
    for row in sorted(report, key=lambda r: (r["university_id"], r["office_id"])):
        uni_id = row["university_id"]
        office_id = row["office_id"]
        new_id = f"{uni_id}_{office_id}"
        if new_id in existing_ids:
            skipped += 1
            continue
        institution = institutions.get(uni_id, uni_id)
        name = f"{institution} {OFFICE_NAME_SUFFIX[office_id]}"
        lines.append(f"- id: {new_id}")
        lines.append(f"  name: {_yaml_str(name)}")
        lines.append(f"  institution: {_yaml_str(institution)}")
        lines.append(f"  category: {OFFICE_CATEGORY[office_id]}")
        lines.append(f"  url: {_yaml_str(row['final_url'])}")
        lines.append("  source_type: html")
        lines.append("  official: true")
        lines.append("  enabled: true")
        lines.append("  check_every_minutes: 1440")
        existing_ids.add(new_id)
        added += 1

    with open(SOURCES_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"added={added} skipped_existing={skipped}")


if __name__ == "__main__":
    main()
