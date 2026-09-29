#!/usr/bin/env node
// P4 system evidence / operator issue register (docs/EVIDENCE.md). Canonical store: docs/evidence/system-evidence.ndjson.
//
//   report-issue "<summary>" [--owner P2/source-runtime] [--invariant ID] [--ref kind:value]     user-reported issue -> ID + owner
//   capture --type T --origin O --summary S [--ref kind:value] [--observed-at ISO]
//   classify <id> --material|--non-material      route <id> [--owner P/sub] [--invariant ID]
//   decide <id> --action-required | --no-action --resolution R
//   approve <id>    implement <id> --impl kind:value    verify <id> --verify kind:value [--before S --after S]
//   close <id> --resolution R    defer <id> --owner O --reason R --trigger T [--review-by YYYY-MM-DD]
//   reject <id> --resolution R   rollback <id> --resolution R
//   show <id> | audit [--check] | audit-input | project [--check]
// Mutating verbs need --actor kind:id and --apply (otherwise dry run). Nothing here edits a canonical rule or config.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold, readEvents, appendEvent, audit, auditInput, validateLedger, nextId, routeFor, VIOLATION_KEYS } from '../packages/system-evidence/index.mjs';
import { renderTable, applyProjection } from '../packages/system-evidence/projection.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = join(root, 'docs', 'evidence', 'system-evidence.ndjson');
export const SORUN = join(root, 'adapters', 'hekimler-radar', 'content', 'SORUN-TESPIT-LISTESI.md');

function parse(argv) {
  const [verb, ...rest] = argv;
  const o = { verb, _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) o._.push(a);
    else if (['--apply', '--check', '--material', '--non-material', '--action-required', '--no-action', '--json'].includes(a)) o[a.slice(2)] = true;
    else o[a.slice(2)] = rest[++i];
  }
  return o;
}

export function parseRef(s) {
  if (!s) return undefined;
  const i = s.indexOf(':');
  const kind = i > 0 ? s.slice(0, i) : 'note';
  const v = i > 0 ? s.slice(i + 1) : s;
  if (kind === 'commit') return { kind, sha: v };
  if (kind === 'file') return { kind, path: v };
  if (kind === 'url') return { kind, url: v };
  if (kind === 'note') return { kind, note: v };
  return { kind, id: v };
}
const actorOf = (s) => {
  if (!s || !s.includes(':')) return null;
  const [kind, ...id] = s.split(':');
  return { kind, id: id.join(':') };
};
const owner = (s) => (s && s.includes('/') ? { owning_pillar: s.split('/')[0], owning_subsystem: s.split('/').slice(1).join('/') } : null);

export function run(argv, { ledger = LEDGER, sorun = SORUN, now = () => new Date().toISOString() } = {}) {
  const o = parse(argv);
  const records = () => fold(readEvents(ledger));
  const actor = actorOf(o.actor);
  const step = (evidence_id, to, set) => appendEvent(ledger, { evidence_id, to, set, actor, at: now(), apply: o.apply === true });
  const need = (r) => (r.ok ? r : { ...r, fail: true });
  const id = o._[0];
  switch (o.verb) {
    case 'report-issue': {
      if (!actor) return { ok: false, code: 'ACTOR_REQUIRED', fail: true };
      const summary = o._.join(' ');
      const newId = nextId(records(), 'USER_REPORTED_ISSUE');
      const own = owner(o.owner) || (() => { const r = routeFor(summary); return { owning_pillar: r.pillar, owning_subsystem: r.subsystem }; })();
      const at = now();
      const events = [
        ['CAPTURED', { type: 'USER_REPORTED_ISSUE', origin: 'user', observed_at: at, summary, ...(o.ref ? { supporting_reference: parseRef(o.ref) } : {}) }],
        ['CLASSIFIED', { materiality: 'MATERIAL' }],
        ['ROUTED', { ...own, ...(o.invariant ? { affected_invariant: o.invariant } : {}) }],
      ];
      if (o.apply !== true) return { ok: true, dry_run: true, evidence_id: newId, ...own };
      for (const [to, set] of events) {
        const r = step(newId, to, set);
        if (!r.ok) return need(r);
      }
      return { ok: true, evidence_id: newId, status: 'ROUTED', owner: `${own.owning_pillar}/${own.owning_subsystem}` };
    }
    case 'capture': {
      if (!actor) return { ok: false, code: 'ACTOR_REQUIRED', fail: true };
      const newId = nextId(records(), o.type);
      return need({ ...step(newId, 'CAPTURED', { type: o.type, origin: o.origin, observed_at: o['observed-at'] || now(), summary: o.summary, ...(o.ref ? { supporting_reference: parseRef(o.ref) } : {}) }), evidence_id: newId });
    }
    case 'classify': return need(step(id, 'CLASSIFIED', { materiality: o.material ? 'MATERIAL' : o['non-material'] ? 'NON_MATERIAL' : undefined }));
    case 'route': {
      const r = records().get(id);
      const own = owner(o.owner) || (r ? (({ pillar, subsystem }) => ({ owning_pillar: pillar, owning_subsystem: subsystem }))(routeFor(r.summary)) : {});
      return need(step(id, 'ROUTED', { ...own, ...(o.invariant ? { affected_invariant: o.invariant } : {}) }));
    }
    case 'decide': return need(o['no-action'] ? step(id, 'NO_ACTION', { action_required: false, resolution: o.resolution }) : step(id, 'ACTION_REQUIRED', { action_required: true, ...(o.action ? { action_reference: parseRef(o.action) } : {}) }));
    case 'approve': return need(step(id, 'APPROVED', {}));
    case 'implement': return need(step(id, 'IMPLEMENTED', { implementation_reference: parseRef(o.impl) }));
    case 'verify': return need(step(id, 'VERIFIED', { verification_reference: parseRef(o.verify), ...(o.before ? { before_state: o.before } : {}), ...(o.after ? { after_state: o.after } : {}) }));
    case 'close': return need(step(id, 'CLOSED', { resolution: o.resolution }));
    case 'defer': return need(step(id, 'DEFERRED', { deferral: { owner: o.owner, reason: o.reason, review_trigger: o.trigger, ...(o['review-by'] ? { review_by: o['review-by'] } : {}) } }));
    case 'reject': return need(step(id, 'REJECTED', { resolution: o.resolution }));
    case 'rollback': return need(step(id, 'ROLLED_BACK', { resolution: o.resolution, ...(o.after ? { after_state: o.after } : {}) }));
    case 'show': {
      const r = records().get(id);
      return r ? { ok: true, record: r } : { ok: false, code: 'NOT_FOUND', fail: true };
    }
    case 'audit': {
      const events = readEvents(ledger);
      const a = audit(fold(events), { now: now() });
      const invalid = validateLedger(events);
      const violations = Object.fromEntries(VIOLATION_KEYS.map((k) => [k, a[k]]).filter(([, v]) => v.length));
      const out = { ok: true, total: a.total, by_status: a.by_status, open: a.open.length, deferred: a.deferred.length, overdue_deferrals: a.deferred.filter((d) => d.overdue).map((d) => d.id), ledger_invalid_events: invalid, violations };
      if (o.check && (invalid.length || Object.keys(violations).length)) return { ...out, ok: false, fail: true };
      return out;
    }
    case 'audit-input': return { ok: true, ...auditInput(records()) };
    case 'project': {
      const text = readFileSync(sorun, 'utf8');
      const next = applyProjection(text, renderTable(records()));
      if (o.check) return next === text ? { ok: true, projection: 'IN_SYNC' } : { ok: false, fail: true, projection: 'DRIFT', fix: 'node scripts/evidence.mjs project' };
      if (next !== text) writeFileSync(sorun, next);
      return { ok: true, projection: next === text ? 'UNCHANGED' : 'WRITTEN' };
    }
    default:
      return { ok: false, code: 'USAGE', fail: true, usage: 'see header of scripts/evidence.mjs' };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = run(process.argv.slice(2));
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.fail ? 1 : 0);
}
