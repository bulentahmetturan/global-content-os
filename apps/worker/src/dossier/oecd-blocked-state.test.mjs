// Phase H (overnight hardening): OECD stays BLOCKED_PENDING_HUMAN_TERMS_VERIFICATION until a human records the official terms in a reviewed commit.
// Nothing here fetches an OECD page; technical access is never treated as permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CC, CR, CT_ID, OE_ID, CI, PF, freshWorld } from './burnin-support.mjs';

test('the checked-in OECD registration is blocked on every unresolved term, and no switch, control, capacity or env setting can run it', async () => {
  const reg = CC.readerRegistration(OE_ID);
  assert.deepEqual([reg.legal_status, reg.usage_terms, reg.rate_guidance, reg.enabled, reg.state], ['UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED', false, 'CANARY_DISABLED']);
  assert.equal(reg.technical_access, 'VERIFIED', 'technical access is a fact about the API, not a permission');
  assert.ok(reg.blocker && /OECD_USAGE_TERMS_UNRESOLVED/.test(reg.blocker));
  assert.deepEqual(CC.readerAccessBlockers(reg), ['USAGE_TERMS_UNRESOLVED', 'LEGAL_STATUS_UNRESOLVED']);
  // every switch on, capacity verified, checked-in registry (NOT the TEST_ONLY approved one): refused, no source request, no run row
  const w = await freshWorld({ registry: CC.DOSSIER_READER_REGISTRY });
  const out = await CR.invokeCanary(w.deps(), { readerId: OE_ID, operator: 'op' });
  assert.equal(out.status, 'REFUSED');
  assert.deepEqual(out.reasons, ['READER_BLOCKED:USAGE_TERMS_UNRESOLVED', 'READER_BLOCKED:LEGAL_STATUS_UNRESOLVED']);
  assert.equal(w.calls.oecd, 0);
  assert.equal(w.sqlite.prepare(`SELECT COUNT(*) AS n FROM dossier_canary_runs`).get().n, 0);
  // the operator cannot approve it: legal/usage fields are not controls
  await assert.rejects(() => CC.setControl(w.db, { key: 'reader:dossier-oecd-turkiye-mortality:legal_status', value: '1', updatedBy: 'op', now: 't' }), /control_key_invalid/);
  await assert.rejects(() => CC.setControl(w.db, { key: 'reader:dossier-oecd-turkiye-mortality:approved', value: '1', updatedBy: 'op', now: 't' }), /control_key_invalid/);
  // ClinicalTrials is not blocked by it
  const ct = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op' });
  assert.notEqual(ct.status, 'REFUSED');
});

test('the operator surface shows OECD as blocked with the owner action named while ClinicalTrials-only stays runnable', async () => {
  const w = await freshWorld({ registry: CC.DOSSIER_READER_REGISTRY });
  const s = await CI.canaryStatus({ db: w.db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: 'true' }, ctx: w.ctx });
  const oecd = s.readers.find((r) => r.dossier_reader_id === OE_ID);
  assert.equal(oecd.may_run_now, false);
  assert.deepEqual(oecd.access_blockers, ['USAGE_TERMS_UNRESOLVED', 'LEGAL_STATUS_UNRESOLVED']);
  assert.ok(s.operator_summary.owner_actions_required.some((a) => a.code === `VERIFY_SOURCE_TERMS:${OE_ID}` && /human/.test(a.reason)));
  const ct = s.readers.find((r) => r.dossier_reader_id === CT_ID);
  assert.equal(ct.may_run_now, true, 'ClinicalTrials-only is runnable');
});

test('the human verification checklist exists, asks every required question, names the exact lifecycle fields, and approves nothing', () => {
  const doc = readFileSync('docs/DOSSIER-OECD-VERIFICATION-CHECKLIST.md', 'utf8');
  for (const q of ['terms-and-conditions location', 'automated (programmatic) API access', 'Reuse / licence', 'Attribution requirement', 'Rate / request guidance', 'Commercial / internal use restrictions', 'Required source wording', 'Date checked', 'Reviewer', 'Evidence / reference']) assert.ok(doc.includes(q), q);
  for (const f of ['legal_status', 'usage_terms', 'rate_guidance', 'technical_access', 'access_status', 'blocker', 'last_reviewed_at', 'evidence', 'OECD_ATTRIBUTION']) assert.ok(doc.includes(f), f);
  assert.match(doc, /OECD_USAGE_TERMS = UNRESOLVED/);
  assert.match(doc, /OECD_AUTOMATED_ACCESS = UNKNOWN/);
  assert.match(doc, /OECD_CANARY_READY = NO/);
  assert.ok(!/legal_status:\s*'APPROVED'/.test(doc), 'the checklist does not contain an approval');
  // every field it asks to update really exists on the registration type
  const src = readFileSync('apps/worker/src/dossier/canary-control.ts', 'utf8');
  for (const f of ['legal_status', 'usage_terms', 'rate_guidance', 'technical_access', 'access_status', 'blocker', 'last_reviewed_at', 'evidence']) assert.match(src, new RegExp(`\\b${f}:`));
});

test('no script or test in the repository fetches the OECD terms pages (the blocked-state package must not hammer a 403 page)', async () => {
  const { readdirSync } = await import('node:fs');
  const hits = [];
  const scan = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) { if (!/node_modules|\.logs|\.git/.test(p)) scan(p); } else if (/\.(mjs|ts|js)$/.test(e.name) && !e.name.includes('oecd-blocked-state')) { const t = readFileSync(p, 'utf8'); if (/fetch\([^)]*www\.oecd\.org/.test(t)) hits.push(p); } } };
  scan('apps'); scan('scripts');
  assert.deepEqual(hits, []);
});
