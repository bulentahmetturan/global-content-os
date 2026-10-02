"""EVERGREEN executor (temporal-v2): plan-driven, executor-only, dry run by default."""
from __future__ import annotations

import io
import json
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from radar import evergreen_runner as er

NOW = datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc)
RUNNER_SRC = Path(er.__file__).read_text(encoding="utf-8")
SCHEDULED_SRC = (Path(er.__file__).resolve().parents[1] / "scripts" / "evergreen_scheduled_run.py").read_text(encoding="utf-8")


def sitemap(n: int, base="https://my.clevelandclinic.org/health/", lm="2026-09-%02d") -> str:
    rows = "".join(f"<url><loc>{base}sec{i:03d}/topic</loc><lastmod>{lm % (1 + i % 28)}</lastmod></url>" for i in range(n))
    return f'<?xml version="1.0"?><urlset>{rows}</urlset>'


def article(title: str, *, desc="A plain-language reference explaining the condition, its symptoms, causes and the treatment options available.", pub="2024-03-05", mod="2026-08-10", words=900) -> str:
    body = "<p>" + ("medical reference sentence about the condition and its care. " * words) + "</p>"
    return (
        f'<html><head><title>{title} | Cleveland Clinic</title><meta property="og:title" content="{title}">'
        f'<meta property="og:description" content="{desc}"><meta property="article:published_time" content="{pub}T08:00:00Z">'
        f'<meta property="article:modified_time" content="{mod}T08:00:00Z"></head><body><nav>menu</nav>{body}</body></html>'
    )


def site(n=30, base="https://my.clevelandclinic.org/health/", sm="https://my.clevelandclinic.org/site.xml"):
    pages = {sm: (200, sitemap(n, base=base))}
    for i in range(n):
        pages[f"{base}sec{i:03d}/topic"] = (200, article(f"Understanding condition number {i:03d} and its management"))
    return pages


def fetcher(pages, log=None):
    def f(u):
        if log is not None:
            log.append(u)
        return pages.get(u, (404, ""))

    return f


def plan_source(**over):
    """A plan entry exactly as the Worker's evergreenPlan emits it (config values are the Worker's, not the runner's)."""
    src = {
        "source_id": "news-cleveland-clinic-health-essentials-sitemap",
        "feed_id": "news-cleveland-clinic-health-essentials-sitemap",
        "semantic_lane": "Haber",
        "evergreen_view": "health_reference",
        "activation": "CANARY_ONLY",
        "write_allowed": False,
        "write_blockers": ["EVERGREEN_PATH_NOT_ACTIVE:CANARY_ONLY"],
        "tier": "FAMILY_POOL",
        "family": "cleveland",
        "daily_target": 4,
        "budget_remaining_today": 3,
        "evaluation_cap": 20,
        "rediscovery_cadence_hours": 24,
        "deep_archive_cadence_hours": 168,
        "cooldown_days": 90,
        "importance_signal_strategy": "EDITORIAL_RELEVANCE",
        "signal_providers": [],
        "archives": [{"id": "health-library", "kind": "sitemap", "urls": ["https://my.clevelandclinic.org/site.xml"], "path_filter": "/health/"}],
        "cursor": {},
        "seen_keys": [],
        "recent_clusters": {},
    }
    src.update(over)
    return src


class ExecutorOnlyTests(unittest.TestCase):
    def test_write_requires_worker_lease_before_fetch(self):
        with self.assertRaisesRegex(ValueError, "Worker-issued"):
            er.run({"sources": [plan_source(write_allowed=True)]}, write=True, hub="https://hub.example", token="secret", now=NOW, fetch=lambda _: self.fail("must not fetch"))

    def test_blocked_archive_reports_error_to_worker_without_candidates(self):
        src = plan_source(write_allowed=True, run_id="leased")
        with mock.patch.object(er, "hub_post", return_value={"ok": False, "error": "ARCHIVE_HTTP_403"}) as post:
            code, _ = er.run({"sources": [src]}, write=True, hub="https://hub.example", token="secret", now=NOW,
                             fetch=fetcher({"https://my.clevelandclinic.org/site.xml": (403, "")}), out=io.StringIO())
        self.assertEqual(code, 1)
        body = post.call_args.args[3]
        self.assertEqual(body["error"], "ARCHIVE_HTTP_403")
        self.assertEqual(body["items"], [])

    def test_lost_ingest_response_retries_same_payload(self):
        src = plan_source(write_allowed=True, run_id="leased")
        with mock.patch.object(er, "hub_post", side_effect=[TimeoutError(), {"ok": True}]) as post:
            code, _ = er.run({"sources": [src]}, write=True, hub="https://hub.example", token="secret", now=NOW,
                             fetch=fetcher(site(20)), out=io.StringIO())
        self.assertEqual(code, 0)
        self.assertEqual(post.call_args_list[0], post.call_args_list[1])

    def test_missing_plan_fields_raise_instead_of_being_filled_in(self):
        for k in er.PLAN_FIELDS:
            src = plan_source()
            del src[k]
            with self.assertRaises(ValueError, msg=k):
                er.run_source(src, fetch=fetcher({}), now=NOW)

    def test_budget_and_cap_come_from_the_plan(self):
        pages = site(30)
        log: list[str] = []
        res = er.run_source(plan_source(budget_remaining_today=2, evaluation_cap=5), fetch=fetcher(pages, log), now=NOW)
        self.assertEqual(len(res.items), 2)
        self.assertLessEqual(res.stats["evaluated"], 5)
        self.assertLessEqual(sum(1 for u in log if "/sec" in u), 5, "never fetches more article pages than the plan's cap")

    def test_zero_budget_skips_without_fetching(self):
        log: list[str] = []
        res = er.run_source(plan_source(budget_remaining_today=0), fetch=fetcher(site(5), log), now=NOW)
        self.assertEqual(res.items, [])
        self.assertEqual(res.stats["skipped"], "daily_budget_spent")
        self.assertEqual(log, [])

    def test_items_carry_no_temporal_path_lane_or_discovery_mode(self):
        res = er.run_source(plan_source(), fetch=fetcher(site(30)), now=NOW)
        self.assertTrue(res.items)
        for it in res.items:
            for k in ("path", "temporalPath", "temporal_path", "lane", "semanticLane", "discoveryMode", "discovery_mode", "tier", "dailyTarget"):
                self.assertNotIn(k, it)
            self.assertEqual(it["archiveId"], "health-library")

    def test_seen_keys_from_the_plan_are_not_candidates(self):
        pages = site(6)
        seen = [f"https://my.clevelandclinic.org/health/sec{i:03d}/topic" for i in range(6)]
        res = er.run_source(plan_source(seen_keys=seen), fetch=fetcher(pages), now=NOW)
        self.assertEqual(res.items, [])
        self.assertTrue(res.underfilled)

    def test_source_has_no_authority_constants_or_registry_reads(self):
        for pat in (r"rules_json", r"FAMILY_POOL\s*[:=]", r"TIER_TARGETS", r"DEFAULT_TARGET", r"daily_target\s*=", r"cooldown_days\s*=", r"content_family", r"temporal_path", r"source_feeds", r"temporal-paths\.json", r"lifecycle"):
            self.assertIsNone(re.search(pat, RUNNER_SRC.split('"""', 2)[2]), pat)
        self.assertNotIn("api/evergreen/status", RUNNER_SRC, "the executor reads only the plan")

    def test_no_default_hub_url_anywhere(self):
        for src in (RUNNER_SRC, SCHEDULED_SRC):
            self.assertIsNone(re.search(r"https://[a-z0-9.-]*workers\.dev", src))
            self.assertNotIn("DEFAULT_HUB", src)


class WriteOptInTests(unittest.TestCase):
    def test_default_is_dry_run_and_posts_nothing(self):
        out = io.StringIO()
        with mock.patch.object(er, "hub_post") as post:
            code, doc = er.run({"sources": [plan_source()]}, now=NOW, fetch=fetcher(site(20)), out=out)
        post.assert_not_called()
        self.assertEqual(code, 0)
        self.assertEqual(doc["mode"], "dry_run")
        self.assertFalse(doc["sources"][0]["written"])
        self.assertEqual(doc["sources"][0]["write_skipped_reason"], "dry_run")

    def test_write_needs_explicit_hub_and_token(self):
        with self.assertRaises(ValueError):
            er.run({"sources": []}, write=True, now=NOW)
        with self.assertRaises(ValueError):
            er.run({"sources": []}, write=True, hub="https://hub.example", now=NOW)

    def test_write_only_for_plan_write_allowed_sources_and_token_never_printed(self):
        allowed = plan_source(source_id="a", write_allowed=True, write_blockers=[], run_id="worker-run-1")
        blocked = plan_source(source_id="b")
        out = io.StringIO()
        with mock.patch.object(er, "hub_post", return_value={"ok": True, "created": 1}) as post:
            code, doc = er.run({"sources": [allowed, blocked]}, write=True, hub="https://hub.example", token="SECRET-TOKEN-123", now=NOW, fetch=fetcher(site(20)), out=out)
        self.assertEqual(code, 0)
        self.assertEqual(post.call_count, 1)
        body = post.call_args.args[3]
        self.assertEqual(body["sourceId"], "a")
        self.assertEqual(set(body), {"sourceId", "runId", "items", "cursor", "runStats", "error"})
        self.assertEqual(body["runId"], "worker-run-1")
        b = next(s for s in doc["sources"] if s["source_id"] == "b")
        self.assertFalse(b["written"])
        self.assertEqual("plan_write_blocked", b["write_skipped_reason"])
        self.assertNotIn("SECRET-TOKEN-123", out.getvalue())
        self.assertNotIn("SECRET-TOKEN-123", json.dumps(doc))

    def test_underfill_is_reported_not_compensated(self):
        out = io.StringIO()
        code, doc = er.run({"sources": [plan_source(budget_remaining_today=3)]}, now=NOW, fetch=fetcher(site(2)), out=out)
        self.assertEqual(doc["sources"][0]["picked"], 2)
        self.assertTrue(doc["sources"][0]["underfilled"])
        self.assertIn("::warning title=DAILY_TARGET_UNDERFILLED::", out.getvalue())


class QualityGateTests(unittest.TestCase):
    def test_gate_rejects_thin_promo_and_non_article_pages_and_is_not_lowered_by_underfill(self):
        pages = {"https://my.clevelandclinic.org/site.xml": (200, sitemap(3))}
        pages["https://my.clevelandclinic.org/health/sec000/topic"] = (200, article("Short page about a condition but thin", words=5))
        pages["https://my.clevelandclinic.org/health/sec001/topic"] = (200, article("Subscribe to our newsletter for health tips today"))
        pages["https://my.clevelandclinic.org/health/sec002/topic"] = (200, article("Understanding a real condition and how to treat it"))
        res = er.run_source(plan_source(budget_remaining_today=3), fetch=fetcher(pages), now=NOW)
        self.assertEqual(len(res.items), 1)
        self.assertTrue(res.underfilled)
        self.assertEqual(res.stats["rejected"], {"thin_page": 1, "promotional": 1})

    def test_403_and_robots_disallow_are_skipped_and_counted_never_bypassed(self):
        pages = site(4)
        pages["https://my.clevelandclinic.org/health/sec000/topic"] = (403, "")
        pages["https://my.clevelandclinic.org/robots.txt"] = (200, "User-agent: *\nDisallow: /health/sec001/\n")
        log: list[str] = []
        res = er.run_source(plan_source(budget_remaining_today=4), fetch=fetcher(pages, log), now=NOW)
        self.assertEqual(res.stats["blocked"], 1)
        self.assertEqual(res.stats["robots_skipped"], 1)
        self.assertNotIn("https://my.clevelandclinic.org/health/sec001/topic", log)
        self.assertEqual(log.count("https://my.clevelandclinic.org/health/sec000/topic"), 1, "a 403 is never retried")

    def test_robots_403_means_disallow(self):
        r = er.Robots(fetcher({"https://x.example/robots.txt": (403, "")}))
        self.assertFalse(r.allowed("https://x.example/a"))
        r = er.Robots(fetcher({}))
        self.assertTrue(r.allowed("https://x.example/a"), "a 404 robots.txt means no rules")

    def test_parse_page_never_invents_a_date(self):
        p = er.parse_page(article("Understanding Vitamin B12 Benefits and Best Sources"))
        self.assertEqual((p.published, p.updated), ("2024-03-05", "2026-08-10"))
        bare = er.parse_page("<html><head><title>A page without any date at all in it</title></head><body>x</body></html>")
        self.assertIsNone(bare.published)
        garbled = er.parse_page('<html><head><meta property="og:title" content="Dietary guidelines explained \ufffd The Nutrition Source"></head></html>')
        self.assertEqual(garbled.title, "Dietary guidelines explained")


class SignalTests(unittest.TestCase):
    def _ev(self, url, title="A reference article with a sufficiently long title", chars=5000, cited=None, lastmod=None, nih=None):
        c = er.Candidate(url=url, lastmod=lastmod, cited_by=cited, nih_percentile=nih)
        return c, er.Evaluation(True, None, er.Page(title, "A plain-language reference explaining the condition.", "2023-01-01", None, chars, None), {"text_chars": chars})

    def test_missing_signal_is_null_never_zero(self):
        c, ev = self._ev("https://x.example/health/a/b")
        sig, reason, _ = er.signal_for(c, ev, strategy="DIRECT_SIGNAL", now=NOW, percentile=None)
        self.assertIsNone(sig["value"])
        self.assertIsNone(sig["type"])
        self.assertEqual(sig["tier"], "T3_EDITORIAL")

    def test_nih_percentile_outranks_raw_citations(self):
        c, ev = self._ev("https://doi.org/10.1002/14651858.cd1", cited=900, nih=42.0)
        sig, reason, _ = er.signal_for(c, ev, strategy="DIRECT_SIGNAL", now=NOW, percentile=None)
        self.assertEqual((sig["type"], sig["source"], reason), ("nih_percentile", "icite", "citation_signal"))

    def test_icite_absent_percentile_stays_none(self):
        cands = [er.Candidate(url="u1", pmid="111"), er.Candidate(url="u2", pmid="222")]
        status = er.icite_enrich(cands, lambda u: {"data": [{"pmid": 111, "nih_percentile": 77.5}, {"pmid": 222}]})
        self.assertEqual(status, "OK")
        self.assertEqual([c.nih_percentile for c in cands], [77.5, None])
        self.assertEqual(er.icite_enrich([er.Candidate(url="u")], lambda u: None), "NO_PMIDS")
        self.assertEqual(er.icite_enrich(cands, lambda u: None), "ERROR")


class ArchiveTests(unittest.TestCase):
    def test_wp_feed_page_window_is_bounded_and_rotates(self):
        self.assertEqual(er.wp_feed_pages_to_fetch({}, 3), [1, 2, 3])
        self.assertEqual(er.wp_feed_pages_to_fetch({"page_cursor": 9}, 3), [1, 9, 10])
        self.assertEqual(er.wp_feed_pages_to_fetch({}, 1), [1])

    def test_sitemap_windows_respect_budget_and_cadence(self):
        entries = er.parse_sitemap(sitemap(200))
        cands, st = er.sitemap_candidates(entries, path_filter="/health/", seen=set(), budget=12, state={}, now=NOW, rediscovery_cadence_h=24, deep_cadence_h=168)
        self.assertLessEqual(len(cands), 12)
        self.assertEqual({c.window for c in cands}, {"new", "rotation", "deep"})
        again, _ = er.sitemap_candidates(entries, path_filter="/health/", seen=set(), budget=12, state=st, now=NOW, rediscovery_cadence_h=24, deep_cadence_h=168)
        self.assertEqual({c.window for c in again}, {"new"}, "rotation/deep wait for their plan cadence")

    def test_cochrane_via_europepmc_never_touches_cochranelibrary_and_keeps_provenance(self):
        payload = {
            "nextCursorMark": "AoE",
            "resultList": {
                "result": [
                    {"doi": "10.1002/14651858.CD000001.pub2", "pmid": "123", "title": "Interventions for a common condition: a systematic review.", "abstractText": "<p>Background text.</p>", "firstPublicationDate": "2019-04-01", "citedByCount": 120},
                    {"doi": "10.1016/j.other.2020.1", "title": "Not a Cochrane review at all, different publisher", "firstPublicationDate": "2020-01-01"},
                ]
            },
        }
        urls: list[str] = []

        def jf(u):
            urls.append(u)
            return payload if "europepmc" in u else {"data": [{"pmid": 123, "nih_percentile": 91.0}]}

        log: list[str] = []
        src = plan_source(
            source_id="cochrane-library", semantic_lane="Research", evergreen_view="research_rediscovery", tier="SMALL", family=None,
            budget_remaining_today=1, evaluation_cap=20, importance_signal_strategy="DIRECT_SIGNAL", signal_providers=["europepmc", "icite", "openalex"],
            archives=[{"id": "europepmc-cdsr", "kind": "europepmc", "query": 'JOURNAL:"Cochrane Database Syst Rev"', "sort": "CITED desc", "doi_prefix": "10.1002/14651858", "publisher": "Cochrane", "discovery_proxy": "europepmc"}],
        )
        res = er.run_source(src, fetch=fetcher({}, log), now=NOW, json_fetch=jf)
        self.assertEqual(len(res.items), 1)
        it = res.items[0]
        self.assertEqual(it["url"], "https://doi.org/10.1002/14651858.cd000001.pub2")
        self.assertEqual((it["publisher"], it["discoveredVia"]), ("Cochrane", "europepmc"))
        self.assertEqual(it["signal"]["type"], "nih_percentile")
        self.assertFalse(any("cochranelibrary" in u for u in log + urls))
        self.assertEqual(res.stats["providers"], {"europepmc": "OK", "icite": "OK", "openalex": "NOT_INVOKED_BY_EXECUTOR"})
        self.assertEqual(res.cursor["europepmc-cdsr"]["cursor_mark"], "AoE")

    def test_pubmed_rediscovery_is_bounded_proxied_by_europepmc_and_skips_seen_works(self):
        payload = {
            "resultList": {
                "result": [
                    {"doi": "10.1001/JAMA.2017.19163", "pmid": "29362800", "title": "Preferred reporting items for a systematic review.", "firstPublicationDate": "2018-01-23", "citedByCount": 900, "journalInfo": {"journal": {"title": "JAMA"}}},
                    {"pmid": "31000001", "title": "A meta-analysis without a DOI", "firstPublicationDate": "2019-05-01"},
                    {"doi": "10.1000/seen.1", "pmid": "31000002", "title": "Already surfaced work", "firstPublicationDate": "2019-05-01"},
                    {"title": "No identifier at all"},
                ]
            }
        }
        seen = set(er.seen_keys_for("https://doi.org/10.1000/seen.1"))
        cands = er.pubmed_candidates(payload, archive_id="pm", publisher="PubMed", seen=seen, budget=5)
        self.assertEqual([c.url for c in cands], ["https://doi.org/10.1001/jama.2017.19163", "https://pubmed.ncbi.nlm.nih.gov/31000001/"])
        self.assertEqual([c.publisher for c in cands], ["JAMA", "PubMed"])
        self.assertEqual({c.discovered_via for c in cands}, {"europepmc"})
        self.assertIsNone(cands[1].cited_by, "missing signal stays None")
        self.assertEqual(len(er.pubmed_candidates(payload, publisher="PubMed", seen=set(), budget=1)), 1)


if __name__ == "__main__":
    unittest.main()
