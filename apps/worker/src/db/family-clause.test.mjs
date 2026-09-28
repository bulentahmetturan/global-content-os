import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { familyClause } = await import('./family-clause.ts');

describe('familyClause — Bible v3 one primary category', () => {
  it('partitions burs / egitim / duyuru', () => {
    const burs = familyClause('burs', 'i.');
    assert.match(burs.sql, /burs_%/);
    const egitim = familyClause('egitim', 'i.');
    assert.match(egitim.sql, /egitim_%/);
    const duyuru = familyClause('duyuru', 'i.');
    assert.match(duyuru.sql, /NOT LIKE 'burs_%'/);
    assert.match(duyuru.sql, /NOT LIKE 'egitim_%'/);
  });
  it('empty family is a no-op for non-hekimler callers', () => {
    assert.equal(familyClause(undefined).sql, '');
    assert.equal(familyClause('').sql, '');
  });
});
