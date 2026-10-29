import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { whoAudienceFit } = await import('./who-audience-gate.ts');
const fit = (t, s = '') => whoAudienceFit(t, s);

describe('WHO audience-fit gate', () => {
  it('accepts Türkiye items', () => {
    assert.equal(fit('WHO supports Türkiye earthquake response').reason, 'turkiye');
  });
  it('accepts Muslim-geography items (Gaza), even outbreak-style', () => {
    const v = fit('Disease outbreak risk rises in Gaza health facilities');
    assert.equal(v.ok, true);
    assert.equal(v.reason, 'muslim_geography');
  });
  it('accepts general public-health rules/guidance', () => {
    assert.equal(fit('WHO issues new guideline on sodium intake').reason, 'public_health_rules');
  });
  it('accepts world-scale wow items', () => {
    assert.equal(fit('First-ever global report on neglected diseases').reason, 'world_wow');
  });
  it('rejects a plain outbreak alert with no Türkiye/Muslim geography', () => {
    const v = fit('Ebola outbreak declared in Uganda district', 'Cases confirmed in two villages');
    assert.deepEqual(v, { ok: false, reason: 'no_audience_fit' });
  });
  it('rejects single-country routine program news', () => {
    assert.equal(fit('WHO and Malawi launch local vaccination campaign').ok, false);
  });
});
