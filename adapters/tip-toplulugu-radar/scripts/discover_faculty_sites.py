"""Discover official medical faculty websites via Wikidata; do not invent URLs."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
OUT = Path(__file__).resolve().parents[1] / "sources" / "_wikidata_medical_schools.json"

QUERY = """
SELECT ?item ?itemLabel ?website WHERE {
  ?item wdt:P31/wdt:P279* wd:Q494230.
  ?item wdt:P17 wd:Q43.
  OPTIONAL { ?item wdt:P856 ?website. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en". }
}
"""


def main() -> None:
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": QUERY, "format": "json"}
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/sparql-results+json"},
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        data = json.loads(response.read().decode())
    rows = []
    for binding in data["results"]["bindings"]:
        rows.append(
            {
                "qid": binding["item"]["value"],
                "name": binding.get("itemLabel", {}).get("value"),
                "website": binding.get("website", {}).get("value"),
            }
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    with_site = sum(1 for row in rows if row.get("website"))
    print(f"wrote {OUT} count={len(rows)} with_website={with_site}")


if __name__ == "__main__":
    main()
