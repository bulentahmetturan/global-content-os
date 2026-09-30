"""Re-probe already-registered sub-office sources with the improved
soft-404-aware probe() from discover_university_suboffices, and report any
that now fail (soft-404, redirected off-host, or no real keyword match).
Does not edit official_sources.yaml — prints a list of ids to disable so a
human/LLM reviews before touching the registry.
"""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from discover_university_suboffices import OFFICE_TYPES, probe  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "sources" / "official_sources.yaml"
OFFICE_SUFFIXES = tuple(f"_{office_id}" for office_id in OFFICE_TYPES)


def main() -> None:
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    targets = []
    for source in data["sources"]:
        for office_id in OFFICE_TYPES:
            if source["id"].endswith(f"_{office_id}"):
                targets.append((source["id"], office_id, source["url"]))
                break

    print(f"Re-checking {len(targets)} sub-office sources...")
    failures = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {
            pool.submit(probe, url, OFFICE_TYPES[office_id]["keywords"]): (sid, office_id, url)
            for sid, office_id, url in targets
        }
        done = 0
        for future in as_completed(futures):
            sid, office_id, url = futures[future]
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(targets)}...")
            result = future.result()
            if not result or not result.get("ok"):
                failures.append((sid, url, result.get("error") if result else "no_result"))

    print(f"\n{len(failures)} sources now fail re-validation:")
    for sid, url, error in failures:
        print(f"  {sid}\t{url}\t{error}")


if __name__ == "__main__":
    main()
