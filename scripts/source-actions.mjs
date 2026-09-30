// Controlled path from ACCEPTED SOURCE_FEEDBACK to the canonical source owner (Package 6 -> P2 reconciliation).
//
//   OBSERVATION -> EVIDENCE -> PROPOSED_ADJUSTMENT -> REVIEW (human / review gate) -> THIS MODULE (canonical owner)
//
// Feedback never writes registry data. This module is the canonical GCOS code that performs a change, and only when
//   1. the feedback event is a SOURCE_FEEDBACK that a human or review gate ACCEPTED (review_state ACCEPTED),
//   2. the caller is an authenticated canonical owner (`authorize` present and returning exactly true -- fail closed),
//   3. the record resolves to exactly one canonical Tıp Topluluğu registry record (registry-find),
//   4. the file is byte-stable under JSON round trip (otherwise the exact patch is returned for a manual edit).
// Nothing is written unless `apply: true` is passed; the default is a dry run that returns the patch.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAt } from './registry-find.mjs';
import { LANES } from './source-lifecycle/model.mjs';
import { LADDER, LANE_POLICY } from './source-lifecycle/cadence.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// The Tıp Topluluğu scheduler (radar/tip_toplulugu_activation.py is_due_for_fetch) reads only this field; legacy `poll_minutes`
// keys on some records are history and are never written.
export const CADENCE_FIELD = LANES.tip_toplulugu.cadenceField;
const CADENCE_PATH = CADENCE_FIELD.split('.');
const CADENCE_BOUNDS = LANE_POLICY.tip_toplulugu;

export const SOURCE_ACTIONS = ['disable', 'revalidate', 'change_url', 'change_cadence', 'parser_review', 'classification_review'];
// PROPOSED_ADJUSTMENT.action (feedback schema) -> owner action implemented here
const ADJUSTMENT_TO_ACTION = { DISABLE: 'disable', CHANGE_URL: 'change_url', CHANGE_CADENCE: 'change_cadence', REVALIDATE: 'revalidate', REWRITE_PARSER: 'parser_review', RECLASSIFY: 'classification_review' };
const EDIT_ACTIONS = new Set(['disable', 'change_url', 'change_cadence']);
const REVIEW_ACTORS = new Set(['human', 'review_gate']);
const HTTPS_URL = /^https:\/\/\S+$/;

const deny = (code, detail) => ({ ok: false, code, ...(detail ? { detail } : {}) });

export function validateRequest({ feedback, action, params = {}, owner, authorize }) {
  if (typeof authorize !== 'function') return deny('AUTH_FAIL_CLOSED', 'authorize is required');
  let allowed = false;
  try {
    allowed = authorize(owner, action) === true;
  } catch {
    allowed = false;
  }
  if (!allowed || owner?.kind !== 'canonical_owner') return deny('AUTH_FAIL_CLOSED', 'canonical owner authorization required');
  if (!SOURCE_ACTIONS.includes(action)) return deny('UNSUPPORTED_ACTION', action);
  if (!feedback || feedback.feedback_type !== 'SOURCE_FEEDBACK' || feedback.subject_type !== 'source') return deny('NOT_SOURCE_FEEDBACK');
  if (feedback.review_state !== 'ACCEPTED') return deny('NOT_ACCEPTED', `review_state=${feedback.review_state}`);
  if (!REVIEW_ACTORS.has(feedback.reviewed_by?.kind)) return deny('NOT_REVIEWED_BY_HUMAN_OR_GATE');
  const proposed = feedback.proposed_adjustment?.action;
  if (proposed && ADJUSTMENT_TO_ACTION[proposed] !== action) return deny('ACTION_MISMATCH', `proposal ${proposed} != ${action}`);
  if (action === 'change_url' && !HTTPS_URL.test(String(params.url ?? ''))) return deny('INVALID_PARAMS', 'https url required');
  if (action === 'change_cadence') {
    const m = params.poll_minutes;
    if (!(Number.isInteger(m) && m >= CADENCE_BOUNDS.min && m <= CADENCE_BOUNDS.max && LADDER.includes(m))) {
      return deny('INVALID_PARAMS', `poll_minutes must be a ladder step within ${CADENCE_BOUNDS.min}..${CADENCE_BOUNDS.max}`);
    }
  }
  return { ok: true };
}

function patchFor(action, record, params) {
  if (action === 'disable') return { field: 'runtime_activation', before: record.runtime_activation ?? null, after: 'BLOCKED' };
  if (action === 'change_url') return { field: 'source_url', before: record.source_url ?? null, after: params.url };
  const plan = record[CADENCE_PATH[0]];
  const before = plan && typeof plan === 'object' ? plan[CADENCE_PATH[1]] ?? null : undefined;
  return { field: CADENCE_FIELD, before, after: params.poll_minutes };
}

/** Returns a result object; never throws for expected refusals. `apply` must be exactly true to write. */
export function performSourceAction(req) {
  const v = validateRequest(req);
  if (!v.ok) return v;
  const { feedback, action, apply = false, root = repoRoot } = req;
  const base = { action, source_id: feedback.subject_id, feedback_id: feedback.feedback_id };
  if (!EDIT_ACTIONS.has(action)) {
    // revalidate / parser_review / classification_review are work items for the owner's existing tooling; no registry edit.
    return { ok: true, ...base, outcome: 'REVIEW_TASK_RECORDED', edits_registry: false };
  }
  const hits = findAt(root, feedback.subject_id).filter((h) => h.file.startsWith('adapters/tip-toplulugu-radar/content/source-registry-'));
  if (hits.length !== 1) return deny(hits.length ? 'AMBIGUOUS_RECORD' : 'RECORD_NOT_FOUND', `${hits.length} canonical Tıp Topluluğu record(s)`);
  const hit = hits[0];
  const patch = patchFor(action, hit.record, req.params ?? {});
  if (action === 'change_cadence' && patch.before === undefined) return deny('UNSUPPORTED_FOR_RECORD', 'record has no fetch_plan');
  const result = { ok: true, ...base, file: hit.file, path: hit.path, patch };
  const abs = join(root, hit.file);
  const raw = readFileSync(abs, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.split('\r\n').join('\n');
  const data = JSON.parse(text);
  const stable = JSON.stringify(data, null, 2) + '\n' === text;
  if (apply === false) return { ...result, outcome: 'DRY_RUN', writable: stable };
  if (apply !== true) return deny('APPLY_MUST_BE_TRUE');
  if (!stable) return { ...result, outcome: 'REQUIRES_MANUAL_EDIT', reason: 'file is not byte-stable under JSON round trip' };
  const rec = hit.path.split(/[.[\]]+/).filter(Boolean).reduce((o, k) => o[k], data);
  if (patch.field === CADENCE_FIELD) rec[CADENCE_PATH[0]][CADENCE_PATH[1]] = patch.after;
  else rec[patch.field] = patch.after;
  writeFileSync(abs, (JSON.stringify(data, null, 2) + '\n').split('\n').join(eol));
  return { ...result, outcome: 'APPLIED', report_back: { kind: 'canonical_owner_change', system: 'global-content-os', change: `${hit.file}:${hit.path}.${patch.field}` } };
}
