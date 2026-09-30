"""Turkish universities on Wikidata with official websites."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
OUT = Path(__file__).resolve().parents[1] / "sources" / "_wikidata_universities.json"
QUERY = """
SELECT ?item ?itemLabel ?website WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3918.
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
    rows = [
        {
            "qid": b["item"]["value"],
            "name": b.get("itemLabel", {}).get("value"),
            "website": b.get("website", {}).get("value"),
        }
        for b in data["results"]["bindings"]
    ]
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(len(rows), "with_website", sum(1 for r in rows if r.get("website")))


if __name__ == "__main__":
    main()
