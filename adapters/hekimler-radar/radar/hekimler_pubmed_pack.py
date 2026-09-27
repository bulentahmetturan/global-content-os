"""PubMed approved-query pack helpers — finite, reviewable queries only."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def validate_approved_query_pack(pack: Any) -> tuple[bool, str | None]:
    """Reject unrestricted / empty / wildcard biomedical searches."""
    if not isinstance(pack, list) or not pack:
        return False, "approved_query_pack_empty"
    for entry in pack:
        if not isinstance(entry, dict):
            return False, "approved_query_pack_entry_not_object"
        qid = str(entry.get("id") or "").strip()
        term = str(entry.get("term") or "").strip()
        if not qid:
            return False, "approved_query_missing_id"
        if not term or term == "*" or term.lower() in {"medicine", "health", "medical"}:
            return False, "unrestricted_query_rejected"
        if len(term) < 12:
            return False, "query_term_too_short"
        if entry.get("allow_unrestricted") is True:
            return False, "unrestricted_query_rejected"
    return True, None


def pubmed_activation_ready(profile: dict[str, Any]) -> tuple[bool, list[str]]:
    failures: list[str] = []
    method = str(
        (profile.get("fetch_plan") or {}).get("primary_method")
        or profile.get("fetch_mode")
        or ""
    )
    if method != "eutilities_api":
        failures.append("not_eutilities_api")
    ok, reason = validate_approved_query_pack(profile.get("approved_query_pack"))
    if not ok:
        failures.append(reason or "approved_query_pack_invalid")
    if profile.get("reject_unrestricted_search") is not True:
        failures.append("reject_unrestricted_search_required")
    return (len(failures) == 0, failures)


def fetch_approved_query_pack(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Execute only the profile's finite approved_query_pack via E-utilities.

    Fail-closed on unrestricted terms, host/path violations, or HTTP errors.
    """
    ok, reason = validate_approved_query_pack(profile.get("approved_query_pack"))
    if not ok:
        raise ValueError(reason or "approved_query_pack_invalid")
    plan = profile.get("fetch_plan") or {}
    hosts = {h.lower() for h in (plan.get("allowed_hostnames") or [])}
    paths = plan.get("allowed_path_patterns") or ["/entrez/eutils/"]
    eutils = plan.get("eutilities") or {}
    tool = str(eutils.get("tool") or "hekimler_toplulugu")
    email = str(eutils.get("email") or "hekimler-radar@local.invalid")
    delay = float(eutils.get("inter_query_delay_ms") or 400) / 1000.0
    timeout = float(eutils.get("timeout_ms") or 12000) / 1000.0
    out: list[dict[str, Any]] = []
    ua = f"HekimlerContinuousWorker/1.1 (+{tool}; mailto:{email})"

    def _allowed(url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.hostname or "").lower()
        path = parsed.path or "/"
        if host not in hosts:
            return False
        return any(p == "/" or path.startswith(p) for p in paths)

    def _get_json(url: str) -> dict[str, Any]:
        if not _allowed(url):
            raise ValueError("pubmed_host_not_allowed")
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        # NCBI E-utilities rate-limit shared CI addresses (HTTP 429): pace calls and retry with bounded backoff.
        for attempt in range(4):
            time.sleep(0.4)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — host allowlisted
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as err:
                if err.code != 429 or attempt == 3:
                    raise
                retry_after = err.headers.get("Retry-After") if err.headers else None
                delay = min(20.0, float(retry_after)) if retry_after and retry_after.isdigit() else 2.0 * (2 ** attempt)
                time.sleep(delay)
        raise ValueError("pubmed_rate_limited")

    for q in profile.get("approved_query_pack") or []:
        term = str(q.get("term") or "").strip()
        retmax = min(int(q.get("retmax") or 5), 10)
        if len(out) >= int(eutils.get("max_total") or 8):
            break
        qs = urllib.parse.urlencode(
            {
                "db": "pubmed",
                "retmode": "json",
                "retmax": str(retmax),
                "tool": tool,
                "email": email,
                "term": term,
                # Date window enforced by the API itself (Entrez date), default last 90 days.
                "reldate": str(int(eutils.get("reldate_days") or 90)),
                "datetype": "edat",
                "sort": "date",
            }
        )
        search_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?{qs}"
        try:
            data = _get_json(search_url)
        except urllib.error.HTTPError as err:
            raise ValueError(f"pubmed_esearch_http_{err.code}") from err
        ids = (data.get("esearchresult") or {}).get("idlist") or []
        if not ids:
            time.sleep(delay)
            continue
        sum_qs = urllib.parse.urlencode(
            {
                "db": "pubmed",
                "retmode": "json",
                "tool": tool,
                "email": email,
                "id": ",".join(ids),
            }
        )
        summary_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?{sum_qs}"
        try:
            summary = _get_json(summary_url)
        except urllib.error.HTTPError as err:
            raise ValueError(f"pubmed_esummary_http_{err.code}") from err
        result = summary.get("result") or {}
        for pmid in ids:
            row = result.get(pmid) or {}
            title = (row.get("title") or "").strip()
            if not title:
                continue
            pubtypes = row.get("pubtype") or []
            if any("preprint" in str(t).lower() for t in pubtypes):
                continue
            doi = None
            for aid in row.get("articleids") or []:
                if (aid.get("idtype") or "").lower() == "doi":
                    doi = aid.get("value")
                    break
            out.append(
                {
                    "title": title,
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                    "published_at": row.get("pubdate"),
                    "pmid": pmid,
                    "doi": doi,
                    "publication_status": row.get("pubstatus") or "unknown",
                    "pubtype": pubtypes,
                    "excerpt": title,
                }
            )
        time.sleep(delay)
    return out
