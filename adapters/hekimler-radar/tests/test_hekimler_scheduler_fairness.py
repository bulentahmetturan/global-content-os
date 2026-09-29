"""Deterministic scheduler simulations + unit tests (Package 5). No network, no wall clock, no sleeps.

Supported operating assumptions (documented in docs/OPERATIONS.md):
  runs_per_day=1, run_budget_s=2400, source_timeout_s=240, max_retries=2, run_retry_budget=4,
  healthy source cost ~30 s, healthy due-load <= ~40 % of the run budget (utilization <= 0.40),
  <= ~20 % of active sources failing at once.
Under those, a healthy due source is served in the run in which it is due (MAX_HEALTHY_LATENESS_RUNS).
"""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from radar.hekimler_scheduler import (
    Policy,
    RunBudget,
    SourceState,
    assess_capacity,
    classify_failure,
    eligible_at,
    execute_plan,
    plan_run,
    source_status,
)

P = Policy()
T0 = datetime(2026, 1, 1, 4, 17, tzinfo=timezone.utc)
HEALTHY_COST_S = 30
MAX_HEALTHY_LATENESS_RUNS = 1


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class Sim:
    """In-memory Hub telemetry + daily runner using the real plan_run/execute_plan."""

    def __init__(self, cadences: dict[str, int], behavior=None, policy: Policy = P, order: list[str] | None = None,
                 legacy_fixed_order: bool = False):
        self.p = policy
        self.order = list(order or cadences)
        self.cad = dict(cadences)
        self.behavior = behavior or (lambda sid, day: ("ok", HEALTHY_COST_S))
        self.legacy = legacy_fixed_order
        start = T0 - timedelta(days=1)
        self.tel: dict[str, dict] = {}
        for i, sid in enumerate(self.order):
            phase = timedelta(minutes=(i * 997) % max(1440, self.cad[sid]))  # spread cadence phases
            self.tel[sid] = {"last_success_at": iso(start - phase), "last_attempt_at": iso(start - phase), "failure_count": 0}
        self.served_log: list[tuple[int, str]] = []
        self.attempts_log: dict[str, int] = {}
        self.late_at_service: dict[str, int] = {}

    def add(self, sid: str, cadence: int) -> None:
        self.cad[sid] = cadence
        self.order.append(sid)
        self.tel[sid] = {"last_success_at": None, "last_attempt_at": None, "failure_count": 0}

    def states(self) -> list[SourceState]:
        return [SourceState(s, self.cad[s], **self.tel[s]) for s in self.order]

    def run_day(self, day: int) -> dict:
        now = T0 + timedelta(days=day)
        clock = {"t": 0.0}
        states = {s.source_id: s for s in self.states()}
        if self.legacy:
            queue = [s for s in self.order if now >= eligible_at(states[s], P)]
        else:
            queue = plan_run(states.values(), now, self.p).queue
        for sid in queue:
            el = eligible_at(states[sid], self.p)
            if el.year > 1970:
                self.late_at_service[sid] = max(self.late_at_service.get(sid, 0), int((now - el).total_seconds() // 60))

        def run_source(sid: str, retries_allowed: int) -> dict:
            attempts, ok = 0, False
            while attempts <= retries_allowed:
                attempts += 1
                kind, cost = self.behavior(sid, day)
                clock["t"] += self.p.source_timeout_s if kind == "timeout" else cost
                self.attempts_log[sid] = self.attempts_log.get(sid, 0) + 1
                if kind == "ok":
                    ok = True
                    break
                if attempts <= retries_allowed:
                    clock["t"] += self.p.sleep_before_retry_s(attempts)
            t = self.tel[sid]
            t["last_attempt_at"] = iso(now)
            if ok:
                t["last_success_at"], t["failure_count"] = iso(now), 0
            else:
                t["failure_count"] += 1
            return {"source_id": sid, "attempts": attempts, "ok": ok}

        retries_used = 0
        if self.legacy:  # the pre-Package-5 runner: fixed order, full retries per source, killed at the 45-min job cap
            rows, delayed = [], []
            for i, sid in enumerate(queue):
                if clock["t"] >= 2700:
                    delayed = queue[i:]
                    break
                rows.append(run_source(sid, self.p.max_retries))
        else:
            rows, delayed, budget = execute_plan(
                queue, run_source, self.p, lambda: clock["t"],
                sleep_fn=lambda sec: clock.__setitem__("t", clock["t"] + sec))
            retries_used = budget.retries_used
        self.served_log.extend((day, r["source_id"]) for r in rows)
        return {"served": len(rows), "delayed": delayed, "elapsed": clock["t"], "retries": retries_used}

    def run(self, days: int, start: int = 0) -> list[dict]:
        return [self.run_day(d) for d in range(start, start + days)]


def mixed_universe(n_daily=8, n_weekly=17, n_monthly=37) -> dict[str, int]:
    out = {f"sd{i:03d}": 1440 for i in range(n_daily)}
    out.update({f"sw{i:03d}": 10080 for i in range(n_weekly)})
    out.update({f"sm{i:03d}": 43200 for i in range(n_monthly)})
    return out


def lateness_runs(sim: Sim, ids: set[str]) -> int:
    worst = max((sim.late_at_service.get(s, 0) for s in ids), default=0)
    return -(-worst // 1440)


def timeouts(bad: set[str]):
    return lambda sid, day: ("timeout", 0) if sid in bad else ("ok", HEALTHY_COST_S)


class TestPlanUnits(unittest.TestCase):
    def test_oldest_eligible_first_and_deterministic(self):
        d = lambda n: iso(T0 - timedelta(days=n))  # noqa: E731
        st = [SourceState("b", 1440, d(3), d(3)), SourceState("a", 1440, d(5), d(5)), SourceState("c", 1440, d(5), d(5))]
        self.assertEqual(plan_run(st, T0, P).queue, ["a", "c", "b"])
        self.assertEqual(plan_run(list(reversed(st)), T0, P).queue, ["a", "c", "b"])

    def test_partition_not_due_backoff_manual_review(self):
        h = lambda n: iso(T0 - timedelta(hours=n))  # noqa: E731
        st = [
            SourceState("fresh", 10080, h(1), h(1)),
            SourceState("backoff", 1440, h(9 * 24), h(1), failure_count=1),
            SourceState("bad", 1440, h(30 * 24), h(30 * 24), failure_count=5),
            SourceState("ok", 1440, h(48), h(48)),
        ]
        plan = plan_run(st, T0, P)
        self.assertEqual(plan.not_due, ["fresh"])
        self.assertEqual(plan.backoff, ["backoff"])
        self.assertEqual(plan.manual_review, ["bad"])
        self.assertEqual(plan.queue, ["ok", "bad"])  # quarantined sources never displace healthy ones

    def test_backoff_exponential_and_capped(self):
        mins = []
        for f in (1, 2, 3, 20):
            s = SourceState("x", 1440, iso(T0 - timedelta(days=400)), iso(T0), failure_count=f)
            mins.append(int((eligible_at(s, P) - T0).total_seconds() // 60))
        self.assertEqual(mins, [720, 1440, 2880, P.backoff_cap_min])

    def test_status_record_has_diagnostic_fields(self):
        s = SourceState("x", 1440, iso(T0 - timedelta(days=3)), iso(T0 - timedelta(days=1)), failure_count=2)
        rec = source_status(s, T0, P)
        for k in ("source_id", "last_attempt", "last_success", "next_due", "due", "failure_count", "backoff_until",
                  "lateness_min", "manual_review", "never_succeeded", "backoff_active"):
            self.assertIn(k, rec)

    def test_retry_budget_bounded_per_run_and_by_time(self):
        b = RunBudget(P)
        self.assertEqual(b.retries_for_next_source(0), 2)
        b.consume(3)
        b.consume(3)
        self.assertEqual(b.retries_left, 0)
        self.assertEqual(b.retries_for_next_source(0), 0)
        b2 = RunBudget(P)
        self.assertEqual(b2.retries_for_next_source(P.run_budget_s - 300), 0)
        self.assertFalse(b2.may_start(P.run_budget_s - 100))

    def test_execute_plan_reports_capacity_delayed_not_lost(self):
        clock = {"t": 0.0}

        def fn(sid, r):
            clock["t"] += 1000
            return {"source_id": sid, "attempts": 1, "ok": True}

        rows, delayed, _ = execute_plan(["a", "b", "c", "d"], fn, P, lambda: clock["t"])
        self.assertEqual([r["source_id"] for r in rows] + delayed, ["a", "b", "c", "d"])
        self.assertTrue(delayed)

    def test_classify_failure(self):
        self.assertIsNone(classify_failure({"ok": True}))
        self.assertEqual(classify_failure({"ok": False, "error": "source timeout after 240s"}), "TIMEOUT")
        self.assertEqual(classify_failure({"ok": False, "error": "HTTP 403"}), "AUTH_FAILURE")
        self.assertEqual(classify_failure({"ok": False, "d1_quota": True}), "DEPENDENCY_FAILURE")
        self.assertEqual(classify_failure({"ok": False, "error": "connection reset"}), "FETCH_FAILURE")


class TestSimulationMatrix(unittest.TestCase):
    def test_A_normal_load(self):
        sim = Sim(mixed_universe())
        res = sim.run(120)
        self.assertTrue(all(not r["delayed"] for r in res))
        self.assertLessEqual(lateness_runs(sim, set(sim.order)), MAX_HEALTHY_LATENESS_RUNS)
        self.assertLess(max(r["elapsed"] for r in res), P.run_budget_s)

    def test_B_one_permanently_bad_source(self):
        cad = mixed_universe(10, 0, 0)
        order = sorted(cad)
        bad = order[0]  # sorts first => worst position for a fixed-order runner's tail
        sim = Sim(cad, timeouts({bad}), order=order)
        res = sim.run(60)
        self.assertTrue(all(not r["delayed"] for r in res))
        self.assertLessEqual(lateness_runs(sim, set(order) - {bad}), MAX_HEALTHY_LATENESS_RUNS)
        self.assertLess(sim.attempts_log[bad], 45)  # backoff throttles it (unthrottled: 60 days x 3 = 180)

    def test_C_many_failures_20_percent(self):
        cad = mixed_universe()
        order = sorted(cad)
        bad = set(order[::5])
        sim = Sim(cad, timeouts(bad), order=order)
        res = sim.run(120)
        self.assertLessEqual(lateness_runs(sim, set(order) - bad), MAX_HEALTHY_LATENESS_RUNS)
        self.assertLessEqual(max(r["retries"] for r in res), P.run_retry_budget)
        self.assertTrue(all(not r["delayed"] for r in res))

    def test_D_repeated_timeouts_same_sources_do_not_grow_load(self):
        cad = mixed_universe(20, 0, 0)
        order = sorted(cad)
        bad = set(order[:6])
        sim = Sim(cad, timeouts(bad), order=order)
        sim.run(90)
        week = lambda a, b: len([1 for d, s in sim.served_log if a <= d < b and s in bad])  # noqa: E731
        self.assertLessEqual(week(76, 90), week(0, 14))
        self.assertLessEqual(lateness_runs(sim, set(order) - bad), MAX_HEALTHY_LATENESS_RUNS)

    def test_E_tail_fairness_and_legacy_starvation_regression(self):
        cad = {f"s{i:03d}": 1440 for i in range(40)}
        order = sorted(cad)
        bad = set(order[:15])  # 15 permanent timeouts at the FRONT of the registry
        tail = set(order[-10:])
        legacy = Sim(cad, timeouts(bad), order=order, legacy_fixed_order=True)
        lres = legacy.run(10)
        self.assertTrue(any(r["delayed"] for r in lres))  # pre-P5 behaviour: the tail is cut off by the job cap
        self.assertLess(len([1 for _, s in legacy.served_log if s in tail]), 10 * len(tail))
        sim = Sim(cad, timeouts(bad), order=order)
        sim.run(30)
        self.assertEqual({s for _, s in sim.served_log if s in tail}, tail)
        self.assertLessEqual(lateness_runs(sim, set(order) - bad), 2)

    def test_F_mixed_cadence_served_at_cadence(self):
        sim = Sim(mixed_universe())
        sim.run(90)
        for sid, cad in sim.cad.items():
            days = [d for d, s in sim.served_log if s == sid]
            for a, b in zip(days, days[1:]):
                self.assertLessEqual(b - a, -(-cad // 1440) + MAX_HEALTHY_LATENESS_RUNS, sid)

    def test_G_backlog_expansion(self):
        sim = Sim(mixed_universe())
        sim.run(20)
        base = set(sim.order)
        for i in range(119):
            sim.add(f"pending{i:03d}", 10080)
        sim.run(60, start=20)
        first = {}
        for d, s in sim.served_log:
            if s.startswith("pending"):
                first.setdefault(s, d)
        self.assertEqual(len(first), 119)  # nobody starved
        self.assertLessEqual(max(first.values()) - 20, 3)  # 119 never-fetched sources drain in <= 3 runs
        self.assertLessEqual(lateness_runs(sim, base), 3)

    def test_H_recovery(self):
        cad = mixed_universe(10, 0, 0)
        order = sorted(cad)
        flaky = order[3]
        beh = lambda sid, day: ("timeout", 0) if (sid == flaky and day < 30) else ("ok", HEALTHY_COST_S)  # noqa: E731
        sim = Sim(cad, beh, order=order)
        sim.run(70)
        after = [d for d, s in sim.served_log if s == flaky and d >= 30]
        self.assertTrue(after)
        self.assertLessEqual(after[0] - 30, P.backoff_cap_min // 1440 + 1)  # re-probed within the backoff cap
        self.assertEqual(sim.tel[flaky]["failure_count"], 0)
        self.assertGreaterEqual(len([d for d in after if d >= after[0]]), 25)  # back on normal cadence

    def test_I_supported_capacity_181_sources_failure_heavy(self):
        """SUPPORTED_ACTIVE_SOURCE_CAPACITY: today's 62 + 119 pending weekly = 181 sources (~29 due/day, util ~0.36);
        with 20 % permanently timing out, healthy sources are served within MAX_HEALTHY_LATENESS = 2 runs (48 h)."""
        cad = mixed_universe()
        cad.update({f"zp{i:03d}": 10080 for i in range(119)})
        order = sorted(cad)
        bad = set(order[::5])
        sim = Sim(cad, timeouts(bad), order=order)
        res = sim.run(120)
        self.assertLessEqual(lateness_runs(sim, set(order) - bad), 2)
        self.assertLessEqual(max(r["retries"] for r in res), P.run_retry_budget)
        self.assertLessEqual(max(r["elapsed"] for r in res), P.run_budget_s + P.source_timeout_s)  # < 2700 s job cap

    def test_manual_review_reported_not_mutated_and_others_unaffected(self):
        cad = mixed_universe(12, 0, 0)
        order = sorted(cad)
        bad = order[0]
        sim = Sim(cad, timeouts({bad}), order=order)
        sim.run(40)
        self.assertGreaterEqual(sim.tel[bad]["failure_count"], P.manual_review_failures)
        self.assertIn(bad, plan_run(sim.states(), T0 + timedelta(days=40), P).manual_review)
        self.assertLessEqual(lateness_runs(sim, set(order) - {bad}), MAX_HEALTHY_LATENESS_RUNS)


class TestCapacityGuard(unittest.TestCase):
    CYCLE = {"sources_selected": 12, "total_attempts": 12, "duration_seconds": 360, "sources_failed": 0,
             "timeouts": 0, "sources_capacity_delayed": 0, "max_lateness_min": 0}
    CADS = list(mixed_universe().values())

    def test_safe_today_for_weekly_batch(self):
        out = assess_capacity(self.CADS, [self.CYCLE] * 7, P, additional_cadences_min=[10080] * 10)
        self.assertEqual(out["status"], "SAFE", out["reasons"])

    def test_full_backlog_of_daily_sources_is_blocked(self):
        out = assess_capacity(self.CADS, [self.CYCLE] * 7, P, additional_cadences_min=[1440] * 119)
        self.assertEqual(out["status"], "BLOCK")

    def test_capacity_delay_or_lateness_history_blocks(self):
        self.assertEqual(assess_capacity(self.CADS, [dict(self.CYCLE, sources_capacity_delayed=3)], P)["status"], "BLOCK")
        self.assertEqual(assess_capacity(self.CADS, [dict(self.CYCLE, max_lateness_min=P.lateness_attention_min + 1)], P)["status"], "BLOCK")

    def test_high_failure_rate_blocks_and_no_history_cautions(self):
        self.assertEqual(assess_capacity(self.CADS, [dict(self.CYCLE, sources_failed=4)], P)["status"], "BLOCK")
        self.assertEqual(assess_capacity(self.CADS, [], P)["status"], "CAUTION")

    def test_moderate_load_is_not_safe(self):
        out = assess_capacity(self.CADS, [self.CYCLE] * 7, P, additional_cadences_min=[1440] * 40)
        self.assertIn(out["status"], ("CAUTION", "BLOCK"))


if __name__ == "__main__":
    unittest.main()
