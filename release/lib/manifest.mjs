// Release manifest: small, auditable identity record for a release. Validation only -- it never creates a
// SYSTEM_V1 value; that is written at final cutover.
const SHA = /^[0-9a-f]{40}$/;
export const MANIFEST_STATUSES = ['TEMPLATE', 'CANDIDATE', 'CUTOVER_IN_PROGRESS', 'RELEASED', 'ROLLED_BACK'];

export function validateManifest(m) {
  const errors = [];
  const need = (cond, msg) => {
    if (!cond) errors.push(msg);
  };
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  need(MANIFEST_STATUSES.includes(m.status), `status must be one of ${MANIFEST_STATUSES.join('|')}`);
  const template = m.status === 'TEMPLATE';
  need(typeof m.releaseId === 'string' && m.releaseId.length > 0, 'releaseId required');
  for (const side of ['gcos', 'ccos']) {
    const r = m[side];
    need(r && typeof r === 'object', `${side} block required`);
    if (!r) continue;
    need(typeof r.repo === 'string' && r.repo, `${side}.repo required`);
    need(SHA.test(r.commit ?? '') || (template && r.commit === null), `${side}.commit must be a 40-hex sha${template ? ' or null (TEMPLATE)' : ''}`);
    need(Array.isArray(r.migrations), `${side}.migrations must be an array of filenames`);
    need(typeof r.expectedMigrationLevel === 'string' || (template && r.expectedMigrationLevel === null), `${side}.expectedMigrationLevel required`);
  }
  need(typeof m.contractVersion === 'string', 'contractVersion required');
  need(m.deployedAt === null || (typeof m.deployedAt === 'string' && !Number.isNaN(Date.parse(m.deployedAt))), 'deployedAt must be an ISO date or null');
  const rb = m.rollbackRef;
  need(rb && typeof rb === 'object', 'rollbackRef block required');
  if (rb && !template) need(SHA.test(rb.gcosCommit ?? '') && SHA.test(rb.ccosCommit ?? ''), 'rollbackRef.gcosCommit/ccosCommit must be 40-hex shas');
  need(['NOT_YET', 'FROZEN'].includes(m.systemV1), 'systemV1 must be NOT_YET|FROZEN');
  if (m.systemV1 === 'FROZEN') {
    need(m.status === 'RELEASED', 'systemV1=FROZEN requires status=RELEASED');
    need(m.smoke === 'SMOKE_PASS', 'systemV1=FROZEN requires smoke=SMOKE_PASS');
  }
  if (m.status === 'RELEASED') need(m.deployedAt !== null && m.smoke === 'SMOKE_PASS', 'RELEASED requires deployedAt and smoke=SMOKE_PASS');
  if (template) need(m.systemV1 === 'NOT_YET', 'TEMPLATE must keep systemV1=NOT_YET');
  return { ok: errors.length === 0, errors };
}
