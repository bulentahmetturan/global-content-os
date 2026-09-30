// P4 System Evidence-to-Action backbone: one canonical, append-only, Git-reviewed ledger
// (docs/evidence/system-evidence.ndjson). One line = one lifecycle event; a record's state is the fold of its events.
// P4 owns capture/classification/routing/traceability; the owning pillar/subsystem owns the correction.
// Content relevance (accept/reject by source/topic/channel) is P5 and is refused here (WRONG_LOOP).
// No function in this module writes a canonical system file or rule; it only appends ledger events.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

export const TYPES = ['USER_REPORTED_ISSUE', 'RUNTIME', 'TEST', 'CI', 'PRODUCTION_CHECK', 'AUDIT', 'INCIDENT', 'AGENT', 'MIGRATION', 'CONTEXT_TELEMETRY', 'SECURITY'];
export const PILLARS = ['P1', 'P2', 'P3', 'P4', 'P5'];
export const MATERIALITY = ['MATERIAL', 'NON_MATERIAL'];
export const OPEN = ['CAPTURED', 'CLASSIFIED', 'ROUTED', 'ACTION_REQUIRED', 'APPROVED', 'IMPLEMENTED', 'VERIFIED', 'ROLLED_BACK'];
export const STATUSES = [...OPEN, 'NO_ACTION', 'CLOSED', 'DEFERRED', 'REJECTED'];
export const TRANSITIONS = {
  CAPTURED: ['CLASSIFIED', 'DEFERRED', 'REJECTED'],
  CLASSIFIED: ['ROUTED', 'DEFERRED', 'REJECTED'],
  ROUTED: ['NO_ACTION', 'ACTION_REQUIRED', 'DEFERRED', 'REJECTED'],
  NO_ACTION: ['CLOSED'],
  ACTION_REQUIRED: ['APPROVED', 'DEFERRED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED', 'DEFERRED', 'REJECTED'],
  IMPLEMENTED: ['VERIFIED', 'ROLLED_BACK', 'DEFERRED'],
  VERIFIED: ['CLOSED', 'ROLLED_BACK'],
  DEFERRED: ['ROUTED', 'ACTION_REQUIRED', 'APPROVED', 'IMPLEMENTED', 'REJECTED'],
  ROLLED_BACK: ['ACTION_REQUIRED', 'CLOSED'],
  CLOSED: ['ROLLED_BACK'],
  REJECTED: [],
};
const APPROVERS = new Set(['human', 'operator', 'review_gate']);
const MACHINE = new Set(['machine', 'agent', 'ci']);

// Symptom family -> owner (addendum §4.5). Content relevance is deliberately absent: it belongs to P5 feedback.
export const ROUTES = [
  { match: /context|token|prompt size|router|retrieval/i, pillar: 'P4', subsystem: 'context-routing' },
  { match: /cadence|scheduler|fetch|parser|feed|source|registry|tip_toplulugu/i, pillar: 'P2', subsystem: 'source-runtime' },
  { match: /hub|triage|approved_brief|handoff producer/i, pillar: 'P2', subsystem: 'hub-approved-brief' },
  { match: /auth|token gate|unauthenticated|secret|security/i, pillar: 'P3', subsystem: 'security' },
  { match: /callback|readiness|deploy|d1|migration|recovery|github|cloudflare|workflow|cron/i, pillar: 'P3', subsystem: 'operations' },
  { match: /render|qa|production job|composition/i, pillar: 'P3', subsystem: 'ccos-production' },
];
export const DEFAULT_OWNER = { pillar: 'P4', subsystem: 'evidence-triage' };

export function routeFor(summary) {
  const hit = ROUTES.find((r) => r.match.test(summary || ''));
  return hit ? { pillar: hit.pillar, subsystem: hit.subsystem } : { ...DEFAULT_OWNER };
}

const ref = (r) => r && typeof r === 'object' && typeof r.kind === 'string' && (r.id || r.path || r.sha || r.url || r.note);
const err = (code, detail) => ({ ok: false, code, detail });

/** Validates one transition against the folded record. Returns { ok } or { ok:false, code }. */
export function checkTransition(record, to, set = {}, actor = {}) {
  if (!STATUSES.includes(to)) return err('UNKNOWN_STATUS', to);
  if (!actor.kind || !actor.id) return err('ACTOR_REQUIRED');
  const next = { ...(record || {}), ...set };
  if (!record) {
    if (to !== 'CAPTURED' && !set.legacy_import) return err('FIRST_EVENT_MUST_BE_CAPTURED');
    if (!TYPES.includes(next.type)) return err(next.type === 'CONTENT_RELEVANCE' ? 'WRONG_LOOP' : 'INVALID_TYPE', 'content relevance belongs to P5 feedback');
    for (const k of ['origin', 'observed_at', 'summary']) if (!next[k]) return err('MISSING_FIELD', k);
    if (String(next.summary).length > 400) return err('SUMMARY_TOO_LONG');
    if (!set.legacy_import) return { ok: true };
  } else if (!(TRANSITIONS[record.status] || []).includes(to)) {
    return err('ILLEGAL_TRANSITION', `${record.status} -> ${to}`);
  }
  if (!['CAPTURED', 'CLASSIFIED', 'REJECTED'].includes(to)) {
    if (!MATERIALITY.includes(next.materiality)) return err('MISSING_FIELD', 'materiality');
    if (!PILLARS.includes(next.owning_pillar) || !next.owning_subsystem) return err('MISSING_OWNER');
  }
  if (to === 'CLASSIFIED' && !MATERIALITY.includes(next.materiality)) return err('MISSING_FIELD', 'materiality');
  if (to === 'NO_ACTION' && !next.resolution) return err('MISSING_FIELD', 'resolution');
  if (to === 'APPROVED' && !APPROVERS.has(actor.kind)) return err('APPROVAL_REQUIRES_HUMAN_OR_REVIEW_GATE', actor.kind);
  if ((to === 'IMPLEMENTED' || to === 'VERIFIED') && !ref(next.implementation_reference)) return err('MISSING_FIELD', 'implementation_reference');
  // CLOSED after NO_ACTION or ROLLED_BACK needs only a resolution; every other close is a verified close.
  const verifiedClose = to === 'CLOSED' && !['NO_ACTION', 'ROLLED_BACK'].includes(record?.status);
  if (to === 'VERIFIED' || verifiedClose) {
    if (!ref(next.verification_reference)) return err('MISSING_FIELD', 'verification_reference');
    if (next.before_state && !next.after_state) return err('MISSING_FIELD', 'after_state');
  }
  if (['CLOSED', 'REJECTED', 'ROLLED_BACK'].includes(to) && !next.resolution) return err('MISSING_FIELD', 'resolution');
  if (to === 'CLOSED' && MACHINE.has(actor.kind) && next.materiality === 'MATERIAL') return err('MATERIAL_CLOSE_REQUIRES_ACCOUNTABLE_ACTOR');
  if (to === 'DEFERRED') {
    const d = next.deferral || {};
    for (const k of ['owner', 'reason', 'review_trigger']) if (!d[k]) return err('DEFERRAL_INCOMPLETE', k);
  }
  return { ok: true };
}

export function fold(events) {
  const records = new Map();
  for (const e of events) {
    const prev = records.get(e.evidence_id);
    const rec = { ...(prev || { evidence_id: e.evidence_id, created_at: e.at, events: 0 }), ...(e.set || {}) };
    rec.status = e.to;
    rec.updated_at = e.at;
    rec.events = (prev?.events || 0) + 1;
    records.set(e.evidence_id, rec);
  }
  return records;
}

export function readEvents(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      throw new Error(`ledger line ${i + 1} is not JSON`);
    }
  });
}

/** Replays the whole ledger through the guards; returns violations (empty = valid). */
export function validateLedger(events) {
  const seen = new Map();
  const bad = [];
  events.forEach((e, i) => {
    const r = checkTransition(seen.get(e.evidence_id), e.to, e.set, e.actor);
    if (!r.ok) bad.push({ line: i + 1, evidence_id: e.evidence_id, ...r });
    const prev = seen.get(e.evidence_id);
    seen.set(e.evidence_id, { ...(prev || {}), ...(e.set || {}), status: e.to });
  });
  return bad;
}

export function nextId(records, type) {
  const series = type === 'USER_REPORTED_ISSUE' ? 'S' : 'E';
  const nums = [...records.keys()].map((id) => new RegExp(`^${series}(\\d+)`).exec(id)?.[1]).filter(Boolean).map(Number);
  const n = Math.max(0, ...nums) + 1;
  return series === 'S' ? `S${String(n).padStart(2, '0')}` : `E${n}`;
}

/** Validated append. `apply` must be exactly true to write. Returns { ok, event } or a refusal. */
export function appendEvent(path, { evidence_id, to, set = {}, actor, at = new Date().toISOString(), apply = false }) {
  const records = fold(readEvents(path));
  const r = checkTransition(records.get(evidence_id), to, set, actor);
  if (!r.ok) return r;
  const event = { v: 1, evidence_id, to, at, actor, set };
  if (apply !== true) return { ok: true, dry_run: true, event };
  appendFileSync(path, JSON.stringify(event) + '\n');
  return { ok: true, event };
}

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

/** Accountability audit. Every *_violations list must be empty. */
export function audit(records, { now = new Date().toISOString(), approvedAgingDays = 14 } = {}) {
  const all = [...records.values()];
  const open = all.filter((r) => OPEN.includes(r.status));
  const deferred = all.filter((r) => r.status === 'DEFERRED');
  const users = all.filter((r) => r.type === 'USER_REPORTED_ISSUE');
  return {
    total: all.length,
    by_status: Object.fromEntries(STATUSES.map((s) => [s, all.filter((r) => r.status === s).length]).filter(([, n]) => n)),
    open: open.map((r) => ({ id: r.evidence_id, status: r.status, owner: `${r.owning_pillar || '?'}/${r.owning_subsystem || '?'}`, summary: r.summary })),
    deferred: deferred.map((r) => ({ id: r.evidence_id, owner: r.deferral.owner, trigger: r.deferral.review_trigger, review_by: r.deferral.review_by || null, overdue: !!(r.deferral.review_by && r.deferral.review_by < now.slice(0, 10)) })),
    material_without_owner: all.filter((r) => r.materiality === 'MATERIAL' && r.status !== 'CAPTURED' && r.status !== 'CLASSIFIED' && !(r.owning_pillar && r.owning_subsystem)).map((r) => r.evidence_id),
    material_left_unrouted: all.filter((r) => r.materiality === 'MATERIAL' && ['CAPTURED', 'CLASSIFIED'].includes(r.status) && daysBetween(r.updated_at, now) > 1).map((r) => r.evidence_id),
    user_issue_without_owner: users.filter((r) => !(r.owning_pillar && r.owning_subsystem)).map((r) => r.evidence_id),
    closed_without_verification: all.filter((r) => r.status === 'CLOSED' && !ref(r.verification_reference) && !(r.action_required === false && r.resolution)).map((r) => r.evidence_id),
    approved_without_execution: all.filter((r) => r.status === 'APPROVED' && daysBetween(r.updated_at, now) > approvedAgingDays).map((r) => r.evidence_id),
    implemented_without_verification: all.filter((r) => r.status === 'IMPLEMENTED' && daysBetween(r.updated_at, now) > approvedAgingDays).map((r) => r.evidence_id),
  };
}

export const VIOLATION_KEYS = ['material_without_owner', 'material_left_unrouted', 'user_issue_without_owner', 'closed_without_verification', 'approved_without_execution', 'implemented_without_verification'];

/** Compact input every applicable audit must start from: open + deferred items (never the whole ledger). */
export function auditInput(records) {
  const a = audit(records);
  return {
    rule: 'Audits must evaluate canonical invariants, current canonical truth, and every item below. An audit that ignores an open USER_REPORTED_ISSUE is invalid.',
    open: a.open,
    deferred: a.deferred,
  };
}
