"""Resolve faculty Wikipedia pages -> Wikidata official website (P856)."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
ROOT = Path(__file__).resolve().parents[1]
LIST_TITLE = "Türkiye'deki_tıp_fakülteleri_listesi"


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode())


def wiki_links() -> list[str]:
    url = "https://tr.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "parse",
            "page": LIST_TITLE,
            "prop": "links",
            "format": "json",
        }
    )
    data = get_json(url)
    titles = []
    for link in data.get("parse", {}).get("links", []):
        title = link.get("*") or link.get("title")
        if not title:
            continue
        if "Tıp" in title or "tıp" in title:
            titles.append(title)
    return titles


def wikidata_id(title: str) -> str | None:
    url = "https://tr.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "query",
            "prop": "pageprops",
            "ppprop": "wikibase_item",
            "titles": title,
            "format": "json",
        }
    )
    data = get_json(url)
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        qid = page.get("pageprops", {}).get("wikibase_item")
        if qid:
            return qid
    return None


def official_website(qid: str) -> str | None:
    url = "https://www.wikidata.org/wiki/Special:EntityData/" + qid + ".json"
    data = get_json(url)
    entity = data.get("entities", {}).get(qid, {})
    claims = entity.get("claims", {}).get("P856", [])
    for claim in claims:
        value = (
            claim.get("mainsnak", {})
            .get("datavalue", {})
            .get("value")
        )
        if value:
            return value
    return None


def main() -> None:
    titles = wiki_links()
    rows = []
    for i, title in enumerate(titles):
        qid = wikidata_id(title)
        website = official_website(qid) if qid else None
        rows.append({"wikipedia": title, "qid": qid, "website": website})
        print(f"{i+1}/{len(titles)} {title} -> {website}")
        time.sleep(0.15)
    out = ROOT / "sources" / "_faculty_wikidata.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print("with_website", sum(1 for r in rows if r.get("website")), "of", len(rows))


if __name__ == "__main__":
    main()
