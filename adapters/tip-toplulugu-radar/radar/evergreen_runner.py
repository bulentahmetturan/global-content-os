"""EVERGREEN path executor (temporal-v2): bounded archive scans, candidate evaluation, signal lookup, telemetry.

Executor only. Everything it may do comes from a plan (`GET /api/evergreen/plan`, or a local plan file built by the same
Worker code): which sources, budget remaining today, evaluation cap, cadence, cooldown keys, cursor, archives, signal
strategy and providers. It owns no source registry, no temporal path, tier, target, cadence, cooldown, activation or
lifecycle state, and it does not decide NEW vs REDISCOVERY (the Worker does, from canonical known-work state).

Defaults: dry run, nothing is posted. A write needs an explicit opt-in (`write=True`), an explicit hub URL and a token,
and is attempted only for sources the plan marks `write_allowed`. Missing signal is None (never 0), raw citation counts
are never compared across sources, 403/429 and robots.txt disallow are skipped and counted (never bypassed), and no key
or token is ever printed.
"""
from __future__ import annotations

import html as _html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Callable, Iterable

RUNNER_VERSION = "evergreen-executor/2.0"
UA = "evergreen-runner/2.0 (+https://github.com/bulentahmetturan/global-content-os)"
FETCH_TIMEOUT = 25
MIN_TEXT_CHARS = 900  # visible text of an article page below this is a stub/landing page
MIN_DESC_CHARS = 60
PLAN_FIELDS = ("source_id", "budget_remaining_today", "evaluation_cap", "rediscovery_cadence_hours", "deep_archive_cadence_hours", "importance_signal_strategy", "archives", "seen_keys", "cursor")

Fetch = Callable[[str], "tuple[int, str]"]
JsonFetch = Callable[[str], "dict | None"]


# ---------------------------------------------------------------- HTTP
def http_fetch(url: str, *, timeout: int = FETCH_TIMEOUT) -> tuple[int, str]:
    """GET with an identifying User-Agent. Returns (status, text); (0, "") on network error. 403/429 are returned as-is, never retried around."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xml,application/json,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(8_000_000)
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.status, raw.decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except Exception:  # noqa: BLE001
        return 0, ""


def json_fetch_default(url: str) -> dict | None:
    st, text = http_fetch(url)
    if st != 200:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


# ---------------------------------------------------------------- robots.txt (RFC 9309, conservative on access denial)
class Robots:
    """Per-host robots.txt cache. 401/403 or an unreachable/5xx robots.txt = disallow; other 4xx = no rules."""

    def __init__(self, fetch: Fetch):
        self.fetch = fetch
        self.rules: dict[str, list[tuple[str, bool]] | None] = {}

    @staticmethod
    def parse(text: str) -> list[tuple[str, bool]]:
        groups: list[tuple[set[str], list[tuple[str, bool]]]] = []
        agents: set[str] = set()
        rules: list[tuple[str, bool]] = []
        last_was_rule = False
        for line in text.splitlines():
            line = line.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            k, v = (x.strip() for x in line.split(":", 1))
            k = k.lower()
            if k == "user-agent":
                if last_was_rule:
                    groups.append((agents, rules))
                    agents, rules = set(), []
                agents.add(v.lower())
                last_was_rule = False
            elif k in ("allow", "disallow"):
                last_was_rule = True
                if v:
                    rules.append((v, k == "allow"))
        groups.append((agents, rules))
        mine = [r for a, r in groups if any(x != "*" and x in UA.lower() for x in a)]
        if mine:
            return [x for r in mine for x in r]
        return [x for a, r in groups if "*" in a for x in r]

    def allowed(self, url: str) -> bool:
        p = urllib.parse.urlparse(url)
        host = f"{p.scheme}://{p.netloc}"
        if host not in self.rules:
            st, text = self.fetch(host + "/robots.txt")
            if st == 200:
                self.rules[host] = self.parse(text)
            elif st in (401, 403) or st == 0 or st >= 500:
                self.rules[host] = None
            else:
                self.rules[host] = []
        rules = self.rules[host]
        if rules is None:
            return False
        path = p.path or "/"
        best: tuple[int, bool] = (-1, True)
        for prefix, allow in rules:
            pat = re.escape(prefix).replace(r"\*", ".*")
            if pat.endswith(r"\$"):
                pat = pat[:-2] + "$"
            if re.match(pat, path) and len(prefix) > best[0]:
                best = (len(prefix), allow)
        return best[1]


# ---------------------------------------------------------------- archive adapters
@dataclass
class Candidate:
    url: str
    archive_id: str = ""
    lastmod: str | None = None
    window: str = "new"  # new | rotation | deep (scan window, not a discovery mode)
    title: str | None = None  # preset by API adapters (Europe PMC)
    summary: str | None = None
    published: str | None = None
    publisher: str | None = None
    doi: str | None = None
    pmid: str | None = None
    cited_by: int | None = None
    nih_percentile: float | None = None
    discovered_via: str | None = None


def parse_sitemap(xml: str) -> list[tuple[str, str | None]]:
    """(loc, lastmod) pairs from a urlset (sub-sitemap entries of an index are returned the same way)."""
    out: list[tuple[str, str | None]] = []
    for block in re.findall(r"<(?:url|sitemap)>(.*?)</(?:url|sitemap)>", xml, flags=re.S | re.I):
        loc = re.search(r"<loc>\s*(.*?)\s*</loc>", block, re.S | re.I)
        if not loc:
            continue
        lm = re.search(r"<lastmod>\s*(.*?)\s*</lastmod>", block, re.S | re.I)
        out.append((_html.unescape(loc.group(1)), lm.group(1).strip() if lm else None))
    return out


def canonical_key(url: str) -> str:
    """Same normalisation the Worker uses for its URL dedupe key (fragment dropped, lower-cased)."""
    return urllib.parse.urldefrag(url.strip())[0].lower()


def doi_key(url: str) -> str | None:
    """Bare lower-case DOI for doi.org and nature.com/articles URLs (mirrors the Worker's doiFromUrl)."""
    p = urllib.parse.urlparse(url)
    host = p.netloc.lower().removeprefix("www.")
    if host in ("doi.org", "dx.doi.org"):
        d = urllib.parse.unquote(p.path.lstrip("/")).strip().lower()
        return d if re.fullmatch(r"10\.\d{4,9}/\S+", d) else None
    if host == "nature.com":
        m = re.fullmatch(r"/articles/((?:s\d{5}-\d{3}-\d{4,5}-[\dx]|d\d{5}-\d{3}-\d{4,5}-\d))/?", p.path, flags=re.I)
        return f"10.1038/{m.group(1).lower()}" if m else None
    return None


def seen_keys_for(url: str) -> list[str]:
    k = [canonical_key(url)]
    d = doi_key(url)
    if d:
        k.append(d)
    return k


def _due(state: dict, key: str, hours: int, now: datetime) -> bool:
    last = state.get(key)
    if not last:
        return True
    try:
        return now - datetime.fromisoformat(str(last).replace("Z", "+00:00")) >= timedelta(hours=hours)
    except ValueError:
        return True


def sitemap_candidates(
    entries: list[tuple[str, str | None]],
    *,
    archive_id: str = "",
    path_filter: str,
    seen: set[str],
    budget: int,
    state: dict,
    now: datetime,
    rediscovery_cadence_h: int,
    deep_cadence_h: int,
) -> tuple[list[Candidate], dict]:
    """Bounded windows over one archive: newest lastmod first, then a rotating window at a cursor, then a deep jump.

    `budget` caps the candidates. The rotation window runs only when its cadence has elapsed; the deep window (a jump far
    from the rotation cursor) only when its cadence has elapsed. Keys inside the cooldown never consume budget."""
    pool = [(u, lm) for (u, lm) in entries if path_filter in u and not any(k in seen for k in seen_keys_for(u))]
    new_state = dict(state)
    chosen: list[Candidate] = []
    taken: set[str] = set()

    def take(items: Iterable[tuple[str, str | None]], window: str, n: int) -> None:
        for u, lm in items:
            if n <= 0:
                break
            if u in taken:
                continue
            taken.add(u)
            chosen.append(Candidate(url=u, archive_id=archive_id, lastmod=lm, window=window))
            n -= 1

    take(sorted(pool, key=lambda e: e[1] or "", reverse=True), "new", max(1, budget // 2))
    ordered = sorted(pool, key=lambda e: e[0])
    total = len(ordered)
    remaining = budget - len(chosen)
    if total and remaining > 0 and _due(state, "last_rediscovery_at", rediscovery_cadence_h, now):
        n = max(1, remaining // 2) if _due(state, "last_deep_at", deep_cadence_h, now) else remaining
        cur = int(state.get("cursor") or 0) % total
        take(ordered[cur:] + ordered[:cur], "rotation", n)
        new_state["cursor"] = (cur + n) % total
        new_state["last_rediscovery_at"] = now.isoformat()
        remaining = budget - len(chosen)
    if total and remaining > 0 and _due(state, "last_deep_at", deep_cadence_h, now):
        cur = (int(state.get("deep_cursor") or total // 2) + 7919) % total  # prime jump: a different segment each time
        take(ordered[cur:] + ordered[:cur], "deep", remaining)
        new_state["deep_cursor"] = (cur + remaining) % total
        new_state["last_deep_at"] = now.isoformat()
    new_state["archive_size_seen"] = len(entries)
    new_state["archive_pool"] = total
    return chosen, new_state


def wp_feed_items(xml: str) -> list[tuple[str, str | None, str | None]]:
    """(link, pubDate, title) from a WordPress RSS page."""
    out = []
    for block in re.findall(r"<item>(.*?)</item>", xml, flags=re.S | re.I):
        link = re.search(r"<link>\s*(.*?)\s*</link>", block, re.S | re.I)
        if not link:
            continue
        pub = re.search(r"<pubDate>\s*(.*?)\s*</pubDate>", block, re.S | re.I)
        title = re.search(r"<title>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</title>", block, re.S | re.I)
        out.append((_html.unescape(link.group(1)), pub.group(1) if pub else None, _html.unescape(title.group(1)).strip() if title else None))
    return out


def wp_feed_pages_to_fetch(state: dict, max_pages: int) -> list[int]:
    """Page 1 (newest) plus a rotating window of older pages: never the whole pagination in one run."""
    cur = max(2, int(state.get("page_cursor") or 2))
    return [1] + [cur + i for i in range(max(0, max_pages - 1))]


def wp_feed_candidates(
    pages: dict[int, str], *, archive_id: str = "", seen: set[str], budget: int, state: dict, now: datetime, rediscovery_cadence_h: int, deep_cadence_h: int
) -> tuple[list[Candidate], dict]:
    entries: list[tuple[str, str | None]] = []
    for p in sorted(pages):
        for link, pub, _title in wp_feed_items(pages[p]):
            entries.append((link, _to_iso(pub)))
    return sitemap_candidates(entries, archive_id=archive_id, path_filter="", seen=seen, budget=budget, state=state, now=now, rediscovery_cadence_h=rediscovery_cadence_h, deep_cadence_h=deep_cadence_h)


def europepmc_candidates(payload: dict, *, archive_id: str = "", doi_prefix: str, publisher: str, seen: set[str], budget: int) -> list[Candidate]:
    """Records from Europe PMC as a discovery/metadata proxy: canonical URL is the DOI link, the publisher stays the original one."""
    out: list[Candidate] = []
    for r in (payload.get("resultList") or {}).get("result", []):
        doi = (r.get("doi") or "").lower()
        if not doi.startswith(doi_prefix.lower()):
            continue
        url = f"https://doi.org/{doi}"
        if any(k in seen for k in seen_keys_for(url)):
            continue
        cited = r.get("citedByCount")
        out.append(
            Candidate(
                url=url,
                archive_id=archive_id,
                window="api",
                title=(r.get("title") or "").strip().rstrip("."),
                summary=_strip_tags(r.get("abstractText") or "")[:500] or None,
                published=(r.get("firstPublicationDate") or None),
                publisher=publisher,
                doi=doi,
                pmid=r.get("pmid"),
                cited_by=int(cited) if isinstance(cited, int) and not isinstance(cited, bool) else None,
                discovered_via="europepmc",
            )
        )
        if len(out) >= budget:
            break
    return out


def pubmed_candidates(payload: dict, *, archive_id: str = "", publisher: str, seen: set[str], budget: int) -> list[Candidate]:
    """PubMed records (Europe PMC SRC:MED). Canonical URL: the DOI link when there is a DOI, else the PubMed page."""
    out: list[Candidate] = []
    for r in (payload.get("resultList") or {}).get("result", []):
        doi = (r.get("doi") or "").lower() or None
        pmid = str(r.get("pmid") or "")
        if not doi and not pmid.isdigit():
            continue
        url = f"https://doi.org/{doi}" if doi else f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        if any(k in seen for k in seen_keys_for(url)):
            continue
        cited = r.get("citedByCount")
        journal = ((r.get("journalInfo") or {}).get("journal") or {}).get("title")
        out.append(
            Candidate(
                url=url,
                archive_id=archive_id,
                window="api",
                title=(r.get("title") or "").strip().rstrip("."),
                summary=_strip_tags(r.get("abstractText") or "")[:500] or None,
                published=(r.get("firstPublicationDate") or None),
                publisher=journal or publisher,
                doi=doi,
                pmid=pmid or None,
                cited_by=int(cited) if isinstance(cited, int) and not isinstance(cited, bool) else None,
                discovered_via="europepmc",
            )
        )
        if len(out) >= budget:
            break
    return out


def icite_enrich(cands: list[Candidate], json_fetch: JsonFetch) -> str:
    """One batched NIH iCite call for candidates with a PMID. Absent percentiles stay None. Returns the provider status."""
    pmids = [c.pmid for c in cands if c.pmid and str(c.pmid).isdigit()][:200]
    if not pmids:
        return "NO_PMIDS"
    payload = json_fetch("https://icite.od.nih.gov/api/pubs?" + urllib.parse.urlencode({"pmids": ",".join(pmids), "fl": "pmid,nih_percentile,relative_citation_ratio,citation_count"}))
    if not payload or not isinstance(payload.get("data"), list):
        return "ERROR"
    by = {str(d.get("pmid")): d for d in payload["data"] if isinstance(d, dict)}
    for c in cands:
        d = by.get(str(c.pmid))
        v = d.get("nih_percentile") if d else None
        c.nih_percentile = float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    return "OK"


# ---------------------------------------------------------------- page evaluation
@dataclass
class Page:
    title: str | None
    description: str | None
    published: str | None
    updated: str | None
    text_chars: int
    canonical: str | None


def _strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _to_iso(v: str | None) -> str | None:
    if not v:
        return None
    v = v.strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    try:
        from email.utils import parsedate_to_datetime

        return parsedate_to_datetime(v).date().isoformat()
    except (TypeError, ValueError):
        return None


def _meta(html: str, *names: str) -> str | None:
    for n in names:
        m = re.search(rf'<meta[^>]+(?:property|name)=["\']{re.escape(n)}["\'][^>]*content=["\']([^"\']*)["\']', html, re.I) or re.search(
            rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{re.escape(n)}["\']', html, re.I
        )
        if m and m.group(1).strip():
            return _html.unescape(m.group(1).strip())
    return None


def parse_page(html: str) -> Page:
    """Title, description, real publication date and update date from the page's own markup. A date is never guessed."""
    title = _meta(html, "og:title", "twitter:title")
    if not title:
        t = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
        title = _strip_tags(t.group(1)) if t else None
    if title:
        # U+FFFD: some publishers emit a mis-encoded dash in og:title
        title = re.sub(r"\s*[|–—\-\ufffd]\s*(Cleveland Clinic|Harvard.*|The Nutrition Source.*|Health Essentials.*)$", "", title, flags=re.I).strip()
    desc = _meta(html, "og:description", "description", "twitter:description")
    published = _meta(html, "article:published_time", "datePublished", "og:article:published_time")
    updated = _meta(html, "article:modified_time", "dateModified", "og:updated_time")
    if not published or not updated:
        for blob in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, flags=re.S | re.I):
            try:
                data = json.loads(blob)
            except ValueError:
                continue
            stack = data if isinstance(data, list) else [data]
            while stack:
                o = stack.pop()
                if isinstance(o, dict):
                    published = published or o.get("datePublished")
                    updated = updated or o.get("dateModified")
                    stack.extend(v for v in o.values() if isinstance(v, (dict, list)))
                elif isinstance(o, list):
                    stack.extend(o)
    body = re.sub(r"<(script|style|nav|header|footer|aside)[\s\S]*?</\1>", " ", html, flags=re.I)
    canonical = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', html, re.I)
    return Page(title=title, description=desc, published=_to_iso(published), updated=_to_iso(updated), text_chars=len(_strip_tags(body)), canonical=canonical.group(1) if canonical else None)


PROMO = re.compile(r"\b(subscribe|newsletter|sign up|donate|webinar|podcast|appointment|find a doctor|careers?|privacy policy|terms of use|login|shop|store)\b", re.I)
BAD_PATH = re.compile(r"/(tag|category|author|search|page|feed|wp-content|wp-json|careers?|about|contact|events?|podcasts?)(/|$)", re.I)


def cluster_of(url: str, title: str | None) -> str:
    """Topic cluster used for diversity: the section in the URL path when there is one, else the first content word of the title."""
    segs = [s for s in urllib.parse.urlparse(url).path.split("/") if s]
    if len(segs) >= 3 and segs[0] in ("health", "articles", "nutritionsource"):
        return segs[1][:40]
    if len(segs) >= 2 and segs[0] not in ("health",):
        return segs[0][:40]
    words = [w for w in re.findall(r"[a-z]{4,}", (title or "").lower()) if w not in {"what", "this", "that", "with", "your", "from", "about", "need", "know", "best", "does", "should"}]
    return (words[0] if words else "general")[:40]


@dataclass
class Evaluation:
    ok: bool
    reason: str | None
    page: Page | None = None
    components: dict = field(default_factory=dict)


def evaluate(cand: Candidate, fetch: Fetch, stats: dict, robots: Robots | None = None) -> Evaluation:
    """Quality gate for one candidate. API candidates (Europe PMC) carry title/abstract; page candidates are fetched once."""
    if BAD_PATH.search(urllib.parse.urlparse(cand.url).path):
        return Evaluation(False, "non_article_path")
    if cand.title is not None:
        title, desc, pub = cand.title, cand.summary, cand.published
        if not title or len(title) < 20:
            return Evaluation(False, "title_too_short")
        return Evaluation(True, None, Page(title, desc, _to_iso(pub), None, len(desc or ""), None), {"abstract_chars": len(desc or "")})
    if robots is not None and not robots.allowed(cand.url):
        stats["robots_skipped"] = stats.get("robots_skipped", 0) + 1
        return Evaluation(False, "robots_disallow")
    status, text = fetch(cand.url)
    if status in (403, 429):
        stats["blocked"] = stats.get("blocked", 0) + 1  # never bypassed, never retried around
        return Evaluation(False, "blocked")
    if status != 200 or not text:
        return Evaluation(False, "fetch_failed")
    page = parse_page(text)
    if not page.title or len(page.title) < 20 or len(page.title) > 220:
        return Evaluation(False, "title_invalid", page)
    if PROMO.search(page.title):
        return Evaluation(False, "promotional", page)
    if page.text_chars < MIN_TEXT_CHARS:
        return Evaluation(False, "thin_page", page)
    if not page.description or len(page.description) < MIN_DESC_CHARS:
        return Evaluation(False, "no_description", page)
    return Evaluation(True, None, page, {"text_chars": page.text_chars, "desc_chars": len(page.description)})


# ---------------------------------------------------------------- signals and selection
def cohort_percentiles(rows: list[tuple[str, int | None, str | None]], *, min_cohort: int = 8) -> dict[str, tuple[float, str]]:
    """Percentile of citedBy within (same source, same publication year). Only cohorts of at least `min_cohort` with real counts.

    Items outside a usable cohort are absent: their raw count stays 'none' normalised and is never compared across sources."""
    cohorts: dict[str, list[tuple[str, int]]] = {}
    for key, cited, pub in rows:
        if cited is None or not pub:
            continue
        cohorts.setdefault(pub[:4], []).append((key, cited))
    out: dict[str, tuple[float, str]] = {}
    for year, members in cohorts.items():
        if len(members) < min_cohort:
            continue
        vals = sorted(c for _k, c in members)
        for key, c in members:
            below = sum(1 for v in vals if v < c)
            equal = sum(1 for v in vals if v == c)
            out[key] = (round(100.0 * (below + 0.5 * equal) / len(vals), 1), f"percentile_within_source_{year}_cohort(n={len(members)})")
    return out


def signal_for(cand: Candidate, ev: Evaluation, *, strategy: str, now: datetime, percentile: tuple[float, str] | None) -> tuple[dict, str, dict]:
    """(signal block, discovery_reason, score components) in tier order: direct, indirect, editorial, exploration."""
    comps: dict = {}
    if strategy == "DIRECT_SIGNAL" and cand.nih_percentile is not None:
        comps["nih_percentile"] = cand.nih_percentile
        return {"tier": "T1_DIRECT", "type": "nih_percentile", "value": cand.nih_percentile, "source": "icite", "observed_at": now.isoformat(), "normalization": "nih_percentile_field_and_year_normalized"}, "citation_signal", comps
    if strategy == "DIRECT_SIGNAL" and cand.cited_by is not None:
        comps["citation_percentile"] = percentile[0] if percentile else None
        return {"tier": "T1_DIRECT", "type": "citation_count", "value": cand.cited_by, "source": "europepmc", "observed_at": now.isoformat(), "normalization": percentile[1] if percentile else "none"}, "citation_signal", comps
    # lastmod within a year = the source updated the page: a verified indirect signal (T2), not a popularity metric.
    lm = cand.lastmod[:10] if cand.lastmod else (ev.page.updated if ev.page else None)
    if lm:
        try:
            lm_days = (now.date() - date.fromisoformat(lm[:10])).days
        except ValueError:
            lm_days = None
        if lm_days is not None and 0 <= lm_days <= 365 and strategy in ("INDIRECT_SIGNAL", "EDITORIAL_RELEVANCE", "DIRECT_SIGNAL"):
            comps["source_updated_days_ago"] = lm_days
            return {"tier": "T2_INDIRECT", "type": None, "value": None, "source": "sitemap_lastmod", "observed_at": now.isoformat(), "normalization": "none"}, "updated_content", comps
    if strategy == "CONTROLLED_EXPLORATION":
        return {"tier": "T4_EXPLORATION", "type": None, "value": None, "source": None, "observed_at": None, "normalization": "none"}, "editorial_rediscovery", comps
    return {"tier": "T3_EDITORIAL", "type": None, "value": None, "source": None, "observed_at": None, "normalization": "none"}, "evergreen_relevance", comps


def editorial_score(ev: Evaluation, cluster: str, recent_clusters: dict[str, int]) -> tuple[float, dict]:
    """Explainable components, no opaque score: information density, description quality, topic novelty."""
    comps = dict(ev.components)
    density = min(2.0, (ev.page.text_chars if ev.page else 0) / 4000.0)
    desc = 1.0 if ev.page and ev.page.description and len(ev.page.description) >= 120 else 0.5
    novelty = 1.0 if cluster not in recent_clusters else 0.4
    comps.update({"information_density": round(density, 2), "description_quality": desc, "topic_novelty": novelty})
    return density + desc + 2.0 * novelty, comps


def pick_candidates(evaluated: list[tuple[Candidate, Evaluation]], *, budget: int, strategy: str, now: datetime, recent_clusters: dict[str, int], label: str = "") -> tuple[list[dict], dict]:
    """Choose up to `budget` (from the plan). Order: direct signal, verified indirect, editorial, exploration; one per topic
    cluster per run. Fewer than `budget` is underfill, never a reason to lower a gate."""
    stats = {"considered": len(evaluated), "dropped_cluster_repeat": 0}
    pct = cohort_percentiles([(c.url, c.cited_by, (ev.page.published if ev.page else None)) for c, ev in evaluated])
    scored = []
    for cand, ev in evaluated:
        cluster = cluster_of(cand.url, ev.page.title if ev.page else None)
        sig, reason, sc = signal_for(cand, ev, strategy=strategy, now=now, percentile=pct.get(cand.url))
        score, comps = editorial_score(ev, cluster, recent_clusters)
        comps.update(sc)
        tier_rank = {"T1_DIRECT": 0, "T2_INDIRECT": 1, "T3_EDITORIAL": 2, "T4_EXPLORATION": 3}[sig["tier"]]
        direct_key = -(comps.get("nih_percentile") or comps.get("citation_percentile") or -1.0) if sig["tier"] == "T1_DIRECT" else 0.0
        scored.append((tier_rank, direct_key, -score, cand.url, cand, ev, cluster, sig, reason, comps))
    scored.sort(key=lambda r: r[:4])
    picked: list[dict] = []
    clusters: set[str] = set()
    for _tr, _dk, _neg, _u, cand, ev, cluster, sig, reason, comps in scored:
        if len(picked) >= budget:
            break
        if cluster in clusters:
            stats["dropped_cluster_repeat"] += 1
            continue
        clusters.add(cluster)
        page = ev.page
        item = {
            "title": (page.title if page else cand.title),
            "url": cand.url,
            "summary": ((page.description if page else cand.summary) or "")[:500],
            "publishedAt": (page.published if page else cand.published),
            "updatedAtSource": (cand.lastmod or (page.updated if page else None)),
            "discoveryReason": reason,
            "signal": sig,
            "whySelected": _why(cand, sig, reason, cluster, comps, recent_clusters, strategy, label),
            "topicCluster": cluster,
            "archiveId": cand.archive_id or None,
        }
        if cand.publisher:
            item["publisher"] = cand.publisher
        if cand.discovered_via:
            item["discoveredVia"] = cand.discovered_via
        if cand.doi:
            item["evidence"] = {"doi": cand.doi, "pmid": cand.pmid}
        picked.append(item)
    return picked, stats


def _why(cand: Candidate, sig: dict, reason: str, cluster: str, comps: dict, recent: dict[str, int], strategy: str, label: str) -> str:
    parts = [p for p in [label, reason, sig["tier"]] if p]
    if sig["value"] is not None:
        parts.append(f"{sig['type']}={sig['value']} via {sig['source']} ({sig['normalization']})")
    elif sig["tier"] == "T2_INDIRECT":
        parts.append(f"source updated {comps.get('source_updated_days_ago')} days ago (no popularity metric)")
    else:
        parts.append("no direct popularity metric")
    parts.append(f"strategy {strategy}")
    parts.append(f"topic {cluster} " + ("not surfaced in the last 14 days" if cluster not in recent else "seen recently, still best available"))
    if "information_density" in comps:
        parts.append(f"density {comps['information_density']}, topic novelty {comps.get('topic_novelty')}")
    if cand.discovered_via:
        parts.append(f"discovered via {cand.discovered_via}, provenance {cand.publisher or 'original publisher'}")
    return "; ".join(parts)[:400]


# ---------------------------------------------------------------- per-source execution
@dataclass
class SourceResult:
    source_id: str
    items: list[dict]
    cursor: dict
    stats: dict
    underfilled: bool


def run_source(src: dict, *, fetch: Fetch, now: datetime, json_fetch: JsonFetch | None = None) -> SourceResult:
    """Execute one plan entry. Every number used here (budget, cap, cadence) comes from the plan."""
    missing = [k for k in PLAN_FIELDS if k not in src]
    if missing:
        raise ValueError(f"plan entry {src.get('source_id', '?')} lacks {','.join(missing)}: the executor never fills config in")
    jf = json_fetch or json_fetch_default
    budget = int(src["budget_remaining_today"])
    cap = int(src["evaluation_cap"])
    seen = set(src.get("seen_keys") or [])
    recent = dict(src.get("recent_clusters") or {})
    cursor_in = dict(src.get("cursor") or {})
    cursor_out: dict = {}
    providers: dict[str, str] = {p: "NOT_USED" for p in (src.get("signal_providers") or [])}
    stats: dict = {"evaluated": 0, "rejected": {}, "blocked": 0, "robots_skipped": 0, "signal_errors": 0, "candidates": 0}
    if budget <= 0:
        stats["skipped"] = "daily_budget_spent"
        return SourceResult(src["source_id"], [], {}, stats, False)
    robots = Robots(fetch)
    archives = list(src["archives"])
    per_archive_cap = max(1, cap // max(1, len(archives)))
    cands: list[Candidate] = []
    for a in archives:
        aid = a.get("id", "")
        st_in = dict(cursor_in.get(aid) or {})
        kind = a.get("kind")
        if kind == "sitemap":
            entries: list[tuple[str, str | None]] = []
            for u in a.get("urls", []):
                if not robots.allowed(u):
                    stats["robots_skipped"] += 1
                    continue
                st, xml = fetch(u)
                if st in (403, 429):
                    stats["blocked"] += 1
                    continue
                if st != 200:
                    stats.setdefault("archive_fetch_failed", 0)
                    stats["archive_fetch_failed"] += 1
                    continue
                entries.extend(parse_sitemap(xml))
            got, st_out = sitemap_candidates(entries, archive_id=aid, path_filter=a.get("path_filter", ""), seen=seen, budget=per_archive_cap, state=st_in, now=now, rediscovery_cadence_h=int(src["rediscovery_cadence_hours"]), deep_cadence_h=int(src["deep_archive_cadence_hours"]))
        elif kind == "wp_feed":
            pages: dict[int, str] = {}
            wanted = wp_feed_pages_to_fetch(st_in, int(a.get("max_pages_per_run", 3)))
            wrapped = False
            for p in wanted:
                u = a["url"] if p == 1 else f"{a['url']}?paged={p}"
                if not robots.allowed(u):
                    stats["robots_skipped"] += 1
                    continue
                st, xml = fetch(u)
                if st in (403, 429):
                    stats["blocked"] += 1
                    break
                if st != 200 or "<item>" not in xml:
                    wrapped = p > 1
                    break
                pages[p] = xml
            got, st_out = wp_feed_candidates(pages, archive_id=aid, seen=seen, budget=per_archive_cap, state=st_in, now=now, rediscovery_cadence_h=int(src["rediscovery_cadence_hours"]), deep_cadence_h=int(src["deep_archive_cadence_hours"]))
            older = [p for p in pages if p > 1]
            st_out["page_cursor"] = 2 if wrapped or not older else max(older) + 1
            st_out["pages_reachable"] = len(pages)
        elif kind in ("europepmc", "pubmed"):
            q = {"query": a["query"], "format": "json", "resultType": "core", "pageSize": str(min(100, max(per_archive_cap * 2, 25))), "sort": a.get("sort", "CITED desc"), "cursorMark": st_in.get("cursor_mark", "*")}
            payload = jf("https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode(q))
            st_out = dict(st_in)
            if not payload:
                stats["signal_errors"] += 1
                if "europepmc" in providers:
                    providers["europepmc"] = "ERROR"
                got = []
            else:
                if "europepmc" in providers:
                    providers["europepmc"] = "OK"
                if kind == "pubmed":
                    got = pubmed_candidates(payload, archive_id=aid, publisher=a["publisher"], seen=seen, budget=per_archive_cap)
                else:
                    got = europepmc_candidates(payload, archive_id=aid, doi_prefix=a["doi_prefix"], publisher=a["publisher"], seen=seen, budget=per_archive_cap)
                st_out["cursor_mark"] = payload.get("nextCursorMark") or st_in.get("cursor_mark", "*")
                if "icite" in providers:
                    providers["icite"] = icite_enrich(got, jf)
                    if providers["icite"] == "ERROR":
                        stats["signal_errors"] += 1
        else:
            stats.setdefault("errors", []).append(f"unknown_archive_kind:{kind}")
            got, st_out = [], dict(st_in)
        cursor_out[aid] = st_out
        cands.extend(got)
    for p in ("crossref", "openalex"):
        if p in providers:
            providers[p] = "NOT_INVOKED_BY_EXECUTOR"
    evaluated: list[tuple[Candidate, Evaluation]] = []
    for cand in cands[:cap]:
        ev = evaluate(cand, fetch, stats, robots)
        stats["evaluated"] += 1
        if ev.ok:
            evaluated.append((cand, ev))
        else:
            stats["rejected"][ev.reason] = stats["rejected"].get(ev.reason, 0) + 1
    label = f"{src.get('tier', '')} {src.get('evergreen_view', '')}".strip()
    items, pstats = pick_candidates(evaluated, budget=budget, strategy=src["importance_signal_strategy"], now=now, recent_clusters=recent, label=label)
    stats.update(pstats)
    stats["candidates"] = len(items)
    stats["providers"] = providers
    return SourceResult(src["source_id"], items, cursor_out, stats, len(items) < budget)


# ---------------------------------------------------------------- plan I/O and main
def hub_get_plan(hub: str) -> dict:
    st, text = http_fetch(hub.rstrip("/") + "/api/evergreen/plan")
    if st != 200:
        raise RuntimeError(f"plan fetch -> HTTP {st}")
    return json.loads(text)


def hub_post(hub: str, token: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        hub.rstrip("/") + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Ingest-Token": token, "User-Agent": UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"HTTP {exc.code}"}


def run(plan: dict, *, only: list[str] | None = None, write: bool = False, hub: str | None = None, token: str | None = None, now: datetime, fetch: Fetch = http_fetch, json_fetch: JsonFetch | None = None, out=sys.stdout) -> tuple[int, dict]:
    """Execute a plan. Without write=True (plus an explicit hub and a token) nothing leaves this process."""
    if write and (not hub or not token):
        raise ValueError("write requires an explicit hub URL and a token")
    report: list[dict] = []
    failures = 0
    for src in plan.get("sources", []):
        if only and src.get("source_id") not in only:
            continue
        res = run_source(src, fetch=fetch, now=now, json_fetch=json_fetch)
        entry = {
            "source_id": res.source_id,
            "semantic_lane": src.get("semantic_lane"),
            "evergreen_view": src.get("evergreen_view"),
            "activation": src.get("activation"),
            "budget_remaining_today": src.get("budget_remaining_today"),
            "picked": len(res.items),
            "underfilled": res.underfilled,
            "stats": res.stats,
            "cursor_proposal": res.cursor,
            "items": res.items,
        }
        if write and src.get("write_allowed") is True:
            r = hub_post(hub, token, "/api/ingress/evergreen-items", {"sourceId": res.source_id, "items": res.items, "cursor": res.cursor, "runStats": res.stats})
            entry["worker"] = {k: r.get(k) for k in ("ok", "created", "rediscovered", "error", "budget")}
            if not r.get("ok"):
                failures += 1
        else:
            entry["written"] = False
            entry["write_skipped_reason"] = "dry_run" if not write else f"plan_write_blocked:{','.join(src.get('write_blockers') or [])}"
        report.append(entry)
    doc = {"runner": RUNNER_VERSION, "generated_at": now.isoformat(), "mode": "write" if write else "dry_run", "sources": report}
    print(json.dumps(doc, ensure_ascii=False, indent=1), file=out)
    for e in report:
        if e["underfilled"]:
            print(f"::warning title=DAILY_TARGET_UNDERFILLED::{e['source_id']} picked {e['picked']} of {e['budget_remaining_today']}", file=out)
    return (1 if failures else 0), doc
