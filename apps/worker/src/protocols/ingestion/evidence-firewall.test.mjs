// Evidence firewall: class separation + direction allowlist + safety fail-closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../../sqlite-d1.test-helper.mjs';

const firewall = await bundle('apps/worker/src/protocols/ingestion/evidence-firewall.ts', 'ingest-firewall');

test('clinical claim may SUPPORTS; definition/safety/commercial CONTEXT only', async () => {
  firewall.assertFirewallLink({ evidenceClass: 'CLINICAL_CLAIM', direction: 'SUPPORTS', claimType: 'OUTCOME' });
  firewall.assertFirewallLink({ evidenceClass: 'DEFINITION', direction: 'CONTEXT', claimType: 'DEFINITION' });
  firewall.assertFirewallLink({ evidenceClass: 'SAFETY', direction: 'CONTEXT', claimType: 'OTHER' });
  firewall.assertFirewallLink({ evidenceClass: 'COMMERCIAL', direction: 'CONTEXT', claimType: 'OTHER' });
});

test('definition as SUPPORTS is a firewall violation', async () => {
  assert.throws(
    () => firewall.assertFirewallLink({ evidenceClass: 'DEFINITION', direction: 'SUPPORTS', claimType: 'DEFINITION' }),
    /FIREWALL_VIOLATION/,
  );
});

test('safety as SUPPORTS is direction misuse', async () => {
  assert.throws(
    () => firewall.assertFirewallLink({ evidenceClass: 'SAFETY', direction: 'SUPPORTS', claimType: 'OTHER' }),
    /FIREWALL_VIOLATION/,
  );
});

test('safety without verified provenance fails closed', async () => {
  assert.throws(
    () => firewall.assertSafetyAdmissible({ hasVerifiedProvenance: false, title: 'Avoid in pregnancy' }),
    /SAFETY_FAIL_CLOSED/,
  );
  firewall.assertSafetyAdmissible({ hasVerifiedProvenance: true, title: 'Avoid in pregnancy' });
});
