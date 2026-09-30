"""Deterministic, I/O-free run scheduler for the Tıp Topluluğu Python runner (Package 5).

Replaces "iterate the registry in file order" (which lets the same tail sources starve when
early sources are slow/broken) with:

* **oldest-eligible-first** ordering -- a source's *eligible_at* is the later of its cadence due time
  (`last_success_at + cadence`) and its failure backoff end; the queue is sorted ascending on it, so the
  source that has waited longest is always served first and no fixed position can starve;
* **failure backoff** -- consecutive failures push a source's eligible time out exponentially (capped), so a
  broken source yields the queue to healthy ones instead of re-consuming the run;
* **manual-review flag** -- `manual_review_failures` consecutive failures marks a source MANUAL_REVIEW_REQUIRED.
  It is only *reported and queued last*; the scheduler never mutates lifecycle/config (no autonomous mutation);
* **bounded budgets** -- a per-source timeout, per-source retries, one shared per-run retry budget and a per-run
  wall-clock budget. Sources that were due but not started are reported as CAPACITY_DELAYED (never silently lost).

Everything takes `now` / an elapsed value as an argument, so the same code is used by the real runner and by the
deterministic simulations in `tests/test_tip_toplulugu_scheduler.py`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

# Failure classes complement (never replace) the source lifecycle / operator_status.
FETCH_FAILURE = "FETCH_FAILURE"
TIMEOUT = "TIMEOUT"
PARSE_FAILURE = "PARSE_FAILURE"
AUTH_FAILURE = "AUTH_FAILURE"
DEPENDENCY_FAILURE = "DEPENDENCY_FAILURE"
CAPACITY_DELAY = "CAPACITY_DELAY"
MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"


@dataclass(frozen=True)
class Policy:
    run_budget_s: int = 2400            # scheduler-visible budget; the CI job hard cap is 45 min (2700 s)
    source_timeout_s: int = 240
    max_retries: int = 2                # per source, per run
    run_retry_budget: int = 4           # total retries across ALL sources in one run
    backoff_base_min: int = 720         # 12 h after the first failure (matches Worker ERROR_BACKOFF_HOURS)
    backoff_cap_min: int = 10080        # 7 d
    manual_review_failures: int = 5
    lateness_attention_min: int = 2880  # 2 d beyond eligible time => attention condition

    def sleep_before_retry_s(self, attempt: int) -> int:
        """Sleep after attempt number `attempt` (1-based) -- identical to the runner's backoff."""
        return min(60, 5 * 2 ** (attempt - 1))


@dataclass(frozen=True)
class SourceState:
    source_id: str
    cadence_min: int = 1440
    last_success_at: str | None = None
    last_attempt_at: str | None = None
    failure_count: int = 0


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def due_at(state: SourceState) -> datetime:
    last = parse_ts(state.last_success_at)
    return EPOCH if last is None else last + timedelta(minutes=state.cadence_min)


def backoff_until(state: SourceState, policy: Policy) -> datetime | None:
    if state.failure_count <= 0:
        return None
    last = parse_ts(state.last_attempt_at)
    if last is None:
        return None
    minutes = min(policy.backoff_cap_min, policy.backoff_base_min * 2 ** (state.failure_count - 1))
    return last + timedelta(minutes=minutes)


def eligible_at(state: SourceState, policy: Policy) -> datetime:
    b = backoff_until(state, policy)
    d = due_at(state)
    return max(d, b) if b else d


def source_status(state: SourceState, now: datetime, policy: Policy) -> dict:
    """Machine-readable per-source scheduling state (the observability record)."""
    el = eligible_at(state, policy)
    b = backoff_until(state, policy)
    never = parse_ts(state.last_success_at) is None
    lateness = None if el == EPOCH else max(0, int((now - el).total_seconds() // 60))
    return {
        "source_id": state.source_id,
        "last_attempt": state.last_attempt_at,
        "last_success": state.last_success_at,
        "next_due": None if el == EPOCH else el.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "due": now >= el,
        "never_succeeded": never,
        "failure_count": state.failure_count,
        "backoff_active": bool(b and now < b and b > due_at(state)),
        "backoff_until": b.strftime("%Y-%m-%dT%H:%M:%SZ") if b else None,
        "lateness_min": lateness,
        "manual_review": state.failure_count >= policy.manual_review_failures,
    }


@dataclass
class Plan:
    queue: list[str] = field(default_factory=list)              # ordered, to be attempted (subject to budget)
    not_due: list[str] = field(default_factory=list)
    backoff: list[str] = field(default_factory=list)            # cadence-due but inside failure backoff
    manual_review: list[str] = field(default_factory=list)      # subset of queue/backoff needing a human
    max_lateness_min: int = 0


def plan_run(states: Iterable[SourceState], now: datetime, policy: Policy, *, force_due: bool = False) -> Plan:
    plan = Plan()
    ready: list[tuple[int, datetime, str]] = []
    for s in states:
        quarantined = s.failure_count >= policy.manual_review_failures
        if quarantined:
            plan.manual_review.append(s.source_id)
        # tier 0 healthy, 1 recently failing, 2 manual-review: failing sources only use budget healthy ones left over
        tier = 2 if quarantined else (1 if s.failure_count > 0 else 0)
        el = eligible_at(s, policy)
        if force_due or now >= el:
            ready.append((tier, el, s.source_id))
            if el != EPOCH:
                plan.max_lateness_min = max(plan.max_lateness_min, int((now - el).total_seconds() // 60))
        elif now >= due_at(s):
            plan.backoff.append(s.source_id)
        else:
            plan.not_due.append(s.source_id)
    # healthy tier first, then oldest eligible time; source_id makes the order total and deterministic
    ready.sort(key=lambda t: (t[0], t[1], t[2]))
    plan.queue = [t[2] for t in ready]
    plan.manual_review.sort()
    return plan


class RunBudget:
    """Time + retry budget for one run. `elapsed` is injected so tests use a virtual clock."""

    def __init__(self, policy: Policy):
        self.policy = policy
        self.retries_left = policy.run_retry_budget
        self.retries_used = 0

    def may_start(self, elapsed_s: float) -> bool:
        return self.policy.run_budget_s - elapsed_s >= self.policy.source_timeout_s

    def retries_for_next_source(self, elapsed_s: float) -> int:
        """Retries this source may use: per-source cap, shared run cap, and what still fits in the time budget."""
        p = self.policy
        remaining = p.run_budget_s - elapsed_s
        fits = 0
        spent = p.source_timeout_s  # first attempt
        while fits < p.max_retries:
            nxt = spent + p.sleep_before_retry_s(fits + 1) + p.source_timeout_s
            if nxt > remaining:
                break
            spent, fits = nxt, fits + 1
        return max(0, min(p.max_retries, self.retries_left, fits))

    def consume(self, attempts: int) -> None:
        used = max(0, attempts - 1)
        self.retries_used += used
        self.retries_left = max(0, self.retries_left - used)


def execute_plan(
    queue: list[str],
    run_source_fn: Callable[[str, int], dict],
    policy: Policy,
    elapsed_fn: Callable[[], float],
    sleep_fn: Callable[[float], None] | None = None,
) -> tuple[list[dict], list[str], RunBudget]:
    """Run `queue` under the budget in two passes (retry-queue separation).

    Pass 1 gives every queued source exactly one attempt, in order. Pass 2 retries transient failures only with
    the budget that is left, bounded per source (`max_retries`) and per run (`run_retry_budget`). A failing source
    therefore can never spend the retries of the run before an unrelated due source has had its first attempt.

    `run_source_fn(source_id, retries_allowed)` returns a row with `ok`, `attempts` and optionally `retryable`
    (default True). Returns (rows, capacity_delayed_ids, budget); capacity_delayed are due sources never started.
    """
    budget = RunBudget(policy)
    rows: list[dict] = []
    delayed: list[str] = []
    for i, sid in enumerate(queue):
        if not budget.may_start(elapsed_fn()):
            delayed = list(queue[i:])
            break
        row = run_source_fn(sid, 0)
        row["attempts"] = int(row.get("attempts") or 1)
        rows.append(row)
    for row in rows:
        while (not row.get("ok") and row.get("retryable", True) and row["attempts"] - 1 < policy.max_retries
               and budget.retries_left > 0 and budget.may_start(elapsed_fn())):
            budget.retries_left -= 1
            budget.retries_used += 1
            if sleep_fn:
                sleep_fn(policy.sleep_before_retry_s(row["attempts"]))
            again = run_source_fn(row["source_id"], 0)
            again["attempts"] = row["attempts"] + int(again.get("attempts") or 1)
            row.clear()
            row.update(again)
    return rows, delayed, budget


def classify_failure(row: dict) -> str | None:
    """Coarse failure class from a runner row; None for a healthy row."""
    if row.get("ok"):
        return None
    text = " ".join(str(row.get(k) or "") for k in ("error", "operator_status", "fetch_result")).lower()
    if row.get("d1_quota") or "quota" in text or ("hub" in text and "fail" in text):
        return DEPENDENCY_FAILURE
    if "401" in text or "403" in text or "unauthor" in text or "token" in text:
        return AUTH_FAILURE
    if "timeout" in text or "timed out" in text:
        return TIMEOUT
    if "parse" in text or "schema" in text or "shape" in text:
        return PARSE_FAILURE
    return FETCH_FAILURE


def attention_conditions(cycle: dict, scheduler: dict, policy: Policy) -> list[str]:
    """Actionable, machine-detectable conditions for ONE finished run. An ordinary single-source failure is NOT one."""
    out: list[str] = []
    selected = int(cycle.get("sources_selected") or 0)
    failed = int(cycle.get("sources_failed") or 0)
    if int(cycle.get("max_lateness_min") or 0) > policy.lateness_attention_min:
        out.append("LATENESS_BEYOND_THRESHOLD")
    if scheduler.get("capacity_delayed"):
        out.append(CAPACITY_DELAY)
    if scheduler.get("manual_review"):
        out.append(MANUAL_REVIEW_REQUIRED)
    if selected >= 4 and failed / selected >= 0.5:
        out.append("SYSTEMIC_FETCH_FAILURE")
    if int(cycle.get("retries_used") or 0) >= policy.run_retry_budget > 0:
        out.append("RETRY_BUDGET_EXHAUSTED")
    return out


def utilization(due_per_day: float, avg_cost_s: float, run_budget_s: float, runs_per_day: float = 1.0) -> float:
    return (due_per_day * avg_cost_s) / (run_budget_s * runs_per_day)


def expected_daily_load(cadences_min: Iterable[int]) -> float:
    """Expected source-runs per day; a daily scheduler serves a source at most once per run, so sub-daily cadences cap at 1."""
    return sum(min(1.0, 1440.0 / max(1, c)) for c in cadences_min)


def assess_capacity(
    cadences_min: list[int],
    recent_cycles: list[dict],
    policy: Policy,
    *,
    additional_cadences_min: Iterable[int] = (),
    default_cost_s: float = 30.0,
    runs_per_day: float = 1.0,
) -> dict:
    """SAFE / CAUTION / BLOCK answer to "can another batch be activated?". Never activates anything.

    Inputs: the active cadences, the last N cycle summaries (run-report.json `cycle` + `scheduler` blocks) and the
    cadences of the proposed batch. Every threshold is explicit so the answer is reproducible.
    """
    adds = list(additional_cadences_min)
    cycles = recent_cycles[-14:]
    selected = sum(int(c.get("sources_selected") or 0) for c in cycles)
    attempts = sum(int(c.get("total_attempts") or 0) for c in cycles)
    dur = sum(float(c.get("duration_seconds") or 0) for c in cycles)
    failed = sum(int(c.get("sources_failed") or 0) for c in cycles)
    timeouts = sum(int(c.get("timeouts") or 0) for c in cycles)
    delayed = sum(int(c.get("sources_capacity_delayed") or 0) for c in cycles)
    retries = sum(max(0, int(c.get("total_attempts") or 0) - int(c.get("sources_selected") or 0)) for c in cycles)
    max_late = max([int(c.get("max_lateness_min") or 0) for c in cycles] or [0])
    avg_cost = (dur / selected) if selected and dur else default_cost_s
    fail_rate = failed / selected if selected else 0.0
    timeout_rate = timeouts / attempts if attempts else 0.0
    retry_load = retries / selected if selected else 0.0

    def daily_seconds(cads: list[int]) -> float:
        return expected_daily_load(cads) * avg_cost

    cur_util = daily_seconds(cadences_min) / (policy.run_budget_s * runs_per_day)
    proj_util = daily_seconds(cadences_min + adds) / (policy.run_budget_s * runs_per_day)
    # failure-heavy: 20 % of projected daily sources burn a full first attempt timeout (backoff bounds repeats)
    fh_seconds = daily_seconds(cadences_min + adds) * 0.8 + 0.2 * expected_daily_load(cadences_min + adds) * policy.source_timeout_s
    fh_util = fh_seconds / (policy.run_budget_s * runs_per_day)

    reasons: list[str] = []
    status = "SAFE"

    def raise_to(level: str, why: str) -> None:
        nonlocal status
        order = {"SAFE": 0, "CAUTION": 1, "BLOCK": 2}
        if order[level] > order[status]:
            status = level
        reasons.append(f"{level}: {why}")

    if proj_util >= 0.80 or fh_util >= 1.0:
        raise_to("BLOCK", f"projected utilization {proj_util:.2f} / failure-heavy {fh_util:.2f} exceeds budget headroom")
    elif proj_util >= 0.50 or fh_util >= 0.80:
        raise_to("CAUTION", f"projected utilization {proj_util:.2f} / failure-heavy {fh_util:.2f}")
    if delayed:
        raise_to("BLOCK", f"{delayed} source(s) were CAPACITY_DELAYED in the last {len(cycles)} cycle(s)")
    if max_late > policy.lateness_attention_min:
        raise_to("BLOCK", f"max lateness {max_late} min exceeds {policy.lateness_attention_min}")
    if fail_rate >= 0.25 or timeout_rate >= 0.20:
        raise_to("BLOCK", f"failure rate {fail_rate:.2f} / timeout rate {timeout_rate:.2f} too high to add load")
    elif fail_rate >= 0.10 or timeout_rate >= 0.05 or retry_load >= 0.25:
        raise_to("CAUTION", f"failure {fail_rate:.2f} / timeout {timeout_rate:.2f} / retry load {retry_load:.2f}")
    if not cycles:
        raise_to("CAUTION", "no recent cycle history; assessment uses default per-source cost")
    return {
        "status": status,
        "reasons": reasons,
        "metrics": {
            "active_sources": len(cadences_min),
            "proposed_additions": len(adds),
            "expected_daily_load": round(expected_daily_load(cadences_min), 2),
            "projected_daily_load": round(expected_daily_load(cadences_min + adds), 2),
            "avg_source_cost_s": round(avg_cost, 1),
            "utilization": round(cur_util, 3),
            "projected_utilization": round(proj_util, 3),
            "failure_heavy_utilization": round(fh_util, 3),
            "failure_rate": round(fail_rate, 3),
            "timeout_rate": round(timeout_rate, 3),
            "retry_load": round(retry_load, 3),
            "max_lateness_min": max_late,
            "capacity_delayed": delayed,
            "cycles_considered": len(cycles),
        },
    }


# --- Package 6 binding: operational attention -> SOURCE_FEEDBACK candidates (thresholded, never per-event) -------------
FEEDBACK_INGEST_ENV = ("GCOS_FEEDBACK_INGEST_URL", "GCOS_FEEDBACK_INGEST_TOKEN")


def feedback_candidates(scheduler: dict, stamp: str, policy: "Policy") -> list[dict]:
    """SOURCE_FEEDBACK inputs for sources that crossed the manual-review threshold (repeated failure).

    A transient failure is TELEMETRY and never produces a candidate. One candidate per source per ISO week bucket, so
    re-running the same day (or the same week) is idempotent at the feedback store. Inputs are proposals only.
    """
    from datetime import datetime

    week = datetime.strptime(stamp[:10], "%Y-%m-%d").strftime("%G-W%V")
    out = []
    for sid in scheduler.get("manual_review") or []:
        out.append({
            "feedback_type": "SOURCE_FEEDBACK",
            "origin_system": "global-content-os",
            "subject_type": "source",
            "subject_id": sid,
            "timestamp": stamp,
            "observation": {"code": "FETCH_FAILURE_REPEATED", "note": f">={policy.manual_review_failures} consecutive failed runs"},
            "evidence": {"refs": [{"kind": "scheduler_report", "id": stamp}], "data": {"consecutive_failures_min": policy.manual_review_failures}},
            "proposed_adjustment": {"action": "REVALIDATE", "target_class": "source_lifecycle", "status": "PROPOSAL",
                                     "rationale": "repeated consecutive failures reported by the scheduler"},
            "correlation": {"source_id": sid},
            "bucket": week,
        })
    return out


def post_feedback_candidates(candidates: list[dict], env: dict, opener) -> dict:
    """Authenticated transport. FAILS CLOSED: without both URL and token nothing is sent (recorded as NOT_SENT)."""
    import json as _json

    url, token = (str(env.get(k) or "").strip() for k in FEEDBACK_INGEST_ENV)
    if not url or not token:
        return {"sent": 0, "status": "NOT_SENT", "reason": "feedback transport not configured (fail closed)"}
    if not url.startswith("https://"):
        return {"sent": 0, "status": "NOT_SENT", "reason": "feedback url must be https"}
    sent = 0
    for c in candidates:
        opener(url, _json.dumps(c).encode("utf-8"), {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        sent += 1
    return {"sent": sent, "status": "SENT"}
