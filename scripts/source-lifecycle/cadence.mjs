// G5 -- automatic cadence. Pure and deterministic:
//   publication timestamps -> robust median gap -> expected gap -> poll = gap/2 -> freshness cap -> lane bounds -> ladder
// The result is written once, through the canonical owner path, into the ONE field the scheduler reads
// (Tıp Topluluğu: fetch_plan.expected_check_interval_minutes). Later observations produce reviewed recalibration proposals;
// nothing rewrites canonical cadence per observation.

export const LADDER = [60, 120, 180, 360, 720, 1440, 2880, 4320, 10080, 20160, 43200];

// min: scheduler granularity (the Tıp Topluluğu runner runs once a day, so < 1440 buys nothing);
// max: longest acceptable blind spot; fallback: conservative class default when history is insufficient;
// freshness: longest acceptable delay between publication and detection for the heading.
export const LANE_POLICY = {
  tip_toplulugu: { min: 1440, max: 20160, fallback: 10080, freshness: { DUYURU: 10080, BURS: 10080, EGITIM: 10080 } },
  'kaduse-news': { min: 60, max: 1440, fallback: 360, freshness: { HABER: 720 } },
  'kaduse-research': { min: 360, max: 1440, fallback: 1440, freshness: { RESEARCH: 1440 } },
};

export const MIN_GAPS = 4;
const SAMPLE_MAX = 30;
const LOOKBACK_DAYS = 365;
const BURST_MIN = 5;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null;
};

export const snapDown = (v, min) => {
  const ok = LADDER.filter((x) => x <= v && x >= min);
  return ok.length ? ok[ok.length - 1] : min;
};

export function deriveCadence({ timestamps = [], lane, heading, now = new Date().toISOString(), evidenceSource = 'feed_published', sourceMinMinutes = null }) {
  const pol = LANE_POLICY[lane];
  if (!pol) throw new Error(`no cadence policy for lane ${lane}`);
  const nowMs = Date.parse(now);
  const lo = nowMs - LOOKBACK_DAYS * 86400000;
  // Future-dated items (deadlines, event dates) are not publications.
  const ts = [...new Set(timestamps.map((t) => Date.parse(t)).filter((t) => Number.isFinite(t) && t >= lo && t <= nowMs + 3600000).map((t) => Math.floor(t / 60000)))]
    .sort((a, b) => b - a)
    .slice(0, SAMPLE_MAX);
  const gaps = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const g = ts[i] - ts[i + 1];
    if (g >= BURST_MIN) gaps.push(g);
  }
  const flags = [];
  const freshness = pol.freshness[heading] ?? pol.max;
  const min = Math.max(pol.min, sourceMinMinutes || 0);
  let expected = null;
  let raw;
  let confidence;
  if (gaps.length < MIN_GAPS) {
    flags.push('INSUFFICIENT_HISTORY');
    raw = pol.fallback;
    confidence = 'LOW';
  } else {
    const m0 = median(gaps);
    const kept = gaps.filter((g) => g <= 10 * m0);
    if (kept.length < gaps.length) flags.push(`OUTLIER_GAPS_IGNORED:${gaps.length - kept.length}`);
    expected = median(kept);
    const sinceLast = Math.round(nowMs / 60000) - ts[0];
    if (sinceLast > 4 * expected && sinceLast > 2880) {
      flags.push('DORMANT_SUSPECT');
      expected *= 2;
    }
    raw = expected / 2;
    confidence = kept.length >= 10 ? 'HIGH' : 'MEDIUM';
  }
  let v = Math.min(raw, freshness);
  if (v !== raw) flags.push('FRESHNESS_CAPPED');
  if (v < min) flags.push('SCHEDULER_FLOOR');
  if (v > pol.max) flags.push('MAX_BLIND_SPOT_CAPPED');
  v = Math.min(Math.max(v, min), pol.max);
  const poll = snapDown(v, min);
  return {
    strategy: 'AUTO_DERIVED_INITIAL',
    poll_minutes: poll,
    bounds: { min, max: pol.max, freshness },
    confidence,
    evidence: {
      source: evidenceSource,
      sample_size: ts.length,
      gaps_used: gaps.length,
      expected_gap_min: expected === null ? null : Math.round(expected),
      newest: ts.length ? new Date(ts[0] * 60000).toISOString() : null,
      computed_at: now,
    },
    flags,
  };
}

/** Reviewed recalibration proposal (never applied here). Hysteresis: at least one ladder step and not LOW confidence. */
export function recalibration(currentMinutes, derived) {
  const cur = Number(currentMinutes) || null;
  if (!cur) return { outcome: 'NO_CURRENT_CADENCE' };
  if (derived.confidence === 'LOW') return { outcome: 'NO_CHANGE', reason: 'insufficient evidence', current: cur, derived: derived.poll_minutes };
  const step = (x) => LADDER.findIndex((l) => l >= x);
  if (step(cur) === step(derived.poll_minutes)) return { outcome: 'NO_CHANGE', current: cur, derived: derived.poll_minutes };
  return {
    outcome: 'PROPOSAL',
    requires: 'canonical owner apply (scripts/source-lifecycle.mjs recalibrate <id> --apply)',
    patch: { field: 'fetch_plan.expected_check_interval_minutes', before: cur, after: derived.poll_minutes },
    evidence: derived.evidence,
  };
}
