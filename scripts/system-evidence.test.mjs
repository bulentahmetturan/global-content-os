import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkTransition, fold, readEvents, validateLedger, audit, auditInput, TRANSITIONS, STATUSES } from '../packages/system-evidence/index.mjs';
import { renderTable, applyProjection, extractRegion, BEGIN, END } from '../packages/system-evidence/projection.mjs';
import { run, LEDGER, SORUN } from './evidence.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const human = 'human:operator-1';
const at = (() => { let n = 0; return () => new Date(Date.UTC(2026, 8, 30, 0, 0, n++)).toISOString(); })();

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'sysev-'));
  const ledger = join(dir, 'ledger.ndjson');
  const sorun = join(dir, 'SORUN.md');
  writeFileSync(sorun, `# x\n\n${BEGIN}\n${END}\n\ntail\n`);
  const cli = (...argv) => run(argv, { ledger, sorun, now: at });
  return { dir, ledger, sorun, cli, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('user-reported issue: durable record with ID, owner and invariant; nothing without --apply', () => {
  const s = sandbox();
  try {
    const dry = s.cli('report-issue', 'scheduler ignores approved cadence change', '--actor', human);
    assert.equal(dry.dry_run, true);
    assert.equal(readEvents(s.ledger).length, 0);
    const r = s.cli('report-issue', 'scheduler ignores approved cadence change', '--actor', human, '--invariant', 'CADENCE_SECOND_SOURCE_OF_TRUTH', '--apply');
    assert.equal(r.evidence_id, 'S01');
    assert.equal(r.owner, 'P2/source-runtime');
    const rec = s.cli('show', 'S01').record;
    assert.equal(rec.type, 'USER_REPORTED_ISSUE');
    assert.equal(rec.status, 'ROUTED');
    assert.equal(rec.affected_invariant, 'CADENCE_SECOND_SOURCE_OF_TRUTH');
    assert.equal(s.cli('report-issue', 'unclassifiable remark', '--actor', human, '--apply').owner, 'P4/evidence-triage');
    assert.equal(s.cli('report-issue', 'x').code, 'ACTOR_REQUIRED');
  } finally {
    s.done();
  }
});

test('full lifecycle: guards on approval, implementation, verification, before/after and close', () => {
  const s = sandbox();
  try {
    const a = ['--actor', human, '--apply'];
    s.cli('report-issue', 'callback redelivery missing for same status', ...a);
    assert.equal(s.cli('close', 'S01', '--resolution', 'x', ...a).code, 'ILLEGAL_TRANSITION');
    assert.equal(s.cli('decide', 'S01', '--action-required', ...a).ok, true);
    assert.equal(s.cli('approve', 'S01', '--actor', 'machine:bot', '--apply').code, 'APPROVAL_REQUIRES_HUMAN_OR_REVIEW_GATE');
    assert.equal(s.cli('approve', 'S01', ...a).ok, true);
    assert.equal(s.cli('implement', 'S01', ...a).code, 'MISSING_FIELD');
    assert.equal(s.cli('implement', 'S01', '--impl', 'commit:abc1234', ...a).ok, true);
    assert.equal(s.cli('verify', 'S01', ...a).code, 'MISSING_FIELD');
    assert.equal(s.cli('verify', 'S01', '--verify', 'test:ops.test.ts', '--before', 'no redelivery', ...a).code, 'MISSING_FIELD');
    assert.equal(s.cli('verify', 'S01', '--verify', 'test:ops.test.ts', '--before', 'no redelivery', '--after', 'bounded redelivery', ...a).ok, true);
    assert.equal(s.cli('close', 'S01', ...a).code, 'MISSING_FIELD');
    assert.equal(s.cli('close', 'S01', '--resolution', 'fixed', ...a).ok, true);
    assert.deepEqual(validateLedger(readEvents(s.ledger)), []);
    assert.equal(s.cli('rollback', 'S01', '--resolution', 'regressed', ...a).ok, true);
    assert.equal(s.cli('show', 'S01').record.status, 'ROLLED_BACK');
  } finally {
    s.done();
  }
});

test('DEFERRED requires owner + reason + review trigger; REJECTED requires a resolution', () => {
  const s = sandbox();
  try {
    const a = ['--actor', human, '--apply'];
    s.cli('report-issue', 'wrangler 3 in GCOS', ...a);
    assert.equal(s.cli('defer', 'S01', '--owner', 'P3/operations', '--reason', 'r', ...a).code, 'DEFERRAL_INCOMPLETE');
    assert.equal(s.cli('defer', 'S01', '--owner', 'P3/operations', '--reason', 'r', '--trigger', 't', '--review-by', '2026-10-01', ...a).ok, true);
    const au = run(['audit'], { ledger: s.ledger, sorun: s.sorun, now: () => '2026-10-05T00:00:00.000Z' });
    assert.deepEqual(au.overdue_deferrals, ['S01']);
    s.cli('report-issue', 'noise', ...a);
    assert.equal(s.cli('reject', 'S02', ...a).code, 'MISSING_FIELD');
    assert.equal(s.cli('reject', 'S02', '--resolution', 'duplicate of S01', ...a).ok, true);
  } finally {
    s.done();
  }
});

test('P5 content relevance is refused (WRONG_LOOP); a machine cannot close material evidence', () => {
  assert.equal(checkTransition(undefined, 'CAPTURED', { type: 'CONTENT_RELEVANCE', origin: 'x', observed_at: 'x', summary: 'topic Y rejected on channel Z' }, { kind: 'human', id: 'h' }).code, 'WRONG_LOOP');
  const rec = { status: 'VERIFIED', materiality: 'MATERIAL', owning_pillar: 'P2', owning_subsystem: 's', implementation_reference: { kind: 'commit', sha: 'a' }, verification_reference: { kind: 'test', id: 't' } };
  assert.equal(checkTransition(rec, 'CLOSED', { resolution: 'ok' }, { kind: 'machine', id: 'bot' }).code, 'MATERIAL_CLOSE_REQUIRES_ACCOUNTABLE_ACTOR');
});

test('every status has a transition row; the module exposes no canonical-file writer', () => {
  for (const s of STATUSES) assert.ok(Array.isArray(TRANSITIONS[s]), s);
  const src = readFileSync(join(root, 'packages/system-evidence/index.mjs'), 'utf8');
  assert.equal((src.match(/appendFileSync\(/g) || []).length, 1, 'single append site');
  assert.doesNotMatch(src, /writeFileSync|rmSync|unlinkSync/);
  assert.doesNotMatch(readFileSync(join(root, 'packages/system-evidence/projection.mjs'), 'utf8'), /writeFileSync|appendFileSync/);
  const cli = readFileSync(join(root, 'scripts/evidence.mjs'), 'utf8');
  assert.equal((cli.match(/writeFileSync\(/g) || []).length, 1, 'only the SORUN projection write');
  assert.match(cli, /writeFileSync\(sorun,/);
});

test('audit input lists every open and deferred item, including user-reported issues', () => {
  const s = sandbox();
  try {
    const a = ['--actor', human, '--apply'];
    s.cli('report-issue', 'hub panel count wrong', ...a);
    s.cli('report-issue', 'deploy workflow stale', ...a);
    s.cli('defer', 'S02', '--owner', 'P3/operations', '--reason', 'r', '--trigger', 't', ...a);
    const input = s.cli('audit-input');
    assert.deepEqual(input.open.map((o) => o.id), ['S01']);
    assert.deepEqual(input.deferred.map((d) => d.id), ['S02']);
    assert.match(input.rule, /ignores an open USER_REPORTED_ISSUE is invalid/);
  } finally {
    s.done();
  }
});

test('projection: generated rows for new records; drift detected; markers required', () => {
  const s = sandbox();
  try {
    s.cli('report-issue', 'a | b pipe in summary', '--actor', human, '--apply');
    assert.equal(s.cli('project', '--check').projection, 'DRIFT');
    assert.equal(s.cli('project').projection, 'WRITTEN');
    assert.equal(s.cli('project', '--check').projection, 'IN_SYNC');
    assert.match(readFileSync(s.sorun, 'utf8'), /\| S01 \| a \\\| b pipe in summary \|/);
    assert.throws(() => applyProjection('no markers', renderTable(new Map())));
  } finally {
    s.done();
  }
});

test('REAL ledger: valid lifecycle replay, zero accountability violations, projection in sync', () => {
  const events = readEvents(LEDGER);
  assert.ok(events.length > 0);
  assert.deepEqual(validateLedger(events), []);
  const records = fold(events);
  const a = audit(records, { now: new Date().toISOString() });
  for (const k of ['material_without_owner', 'user_issue_without_owner', 'closed_without_verification']) assert.deepEqual(a[k], [], k);
  for (const r of records.values()) if (r.type === 'USER_REPORTED_ISSUE') assert.ok(r.evidence_id && r.owning_pillar && r.owning_subsystem, r.evidence_id);
  const text = readFileSync(SORUN, 'utf8');
  assert.equal(extractRegion(applyProjection(text, renderTable(records))), extractRegion(text), 'run: node scripts/evidence.mjs project');
  assert.ok(auditInput(records).deferred.every((d) => d.owner && d.trigger));
});
