/**
 * The 84-item master readiness record: the denominator is frozen, the scoring model is fixed, both scores are recomputed from the per-item statuses
 * (never typed in), live-evidence-only items are never COMPLETE_PROVEN, and every status agrees with the package record that owns that item.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const j = (f) => JSON.parse(readFileSync(`docs/generated/${f}.json`, 'utf8'));
const m = j('statistics-master-readiness-v1');
const canary = j('statistics-first-canary-package-v1');
const infra = j('statistics-production-infra-package-v1');
const recurring = j('statistics-recurring-operation-v1');
const later = j('statistics-later-sources-readiness-v1');
const PCT = { COMPLETE_PROVEN: 100, READY_LOCAL: 80, DESIGNED_AND_TEST_CONTRACT_READY: 60, PARTIAL: 30, BLOCKED: 0 };
const by = Object.fromEntries(m.items.map((x) => [Number(x.item), x]));

describe('master readiness record', () => {
  it('the denominator is exactly items 01..84, once each, with the fixed scoring model and no intermediate percentages', () => {
    assert.equal(m.master_denominator, '84_FROZEN');
    assert.deepEqual(m.items.map((x) => Number(x.item)), Array.from({ length: 84 }, (_, i) => i + 1));
    assert.deepEqual(m.scoring_model.LOCAL_READY_SCORE, PCT);
    for (const x of m.items) assert.equal(x.percent, PCT[x.status], `${x.item} ${x.status}`);
    assert.ok(m.items.every((x) => x.name && x.basis.length > 20));
  });
  it('both scores are recomputed from the statuses and match the record; the 75% target is judged on the computed value', () => {
    const points = m.items.reduce((a, x) => a + PCT[x.status], 0);
    const strict = m.items.filter((x) => x.status === 'COMPLETE_PROVEN').length;
    assert.equal(m.totals.points, points);
    assert.equal(m.totals.LOCAL_READY_SCORE, Math.round((points / 84) * 100) / 100);
    assert.equal(m.totals.STRICT_COMPLETION_PERCENT, Math.round((strict / 84) * 10000) / 100);
    assert.equal(m.totals.TARGET_75_REACHED, points / 84 >= 75);
    assert.ok(m.totals.LOCAL_READY_SCORE >= 75);
    assert.ok(m.totals.STRICT_COMPLETION_PERCENT < m.totals.LOCAL_READY_SCORE, 'the strict metric stays materially lower and is always reported');
  });
  it('items that need live production evidence are never COMPLETE_PROVEN; the owner-input item 37 and the unresolved TUIK items are BLOCKED, not inflated', () => {
    for (const i of m.live_evidence_only_items) assert.notEqual(by[i].status, 'COMPLETE_PROVEN', String(i));
    assert.deepEqual([by[37].status, by[76].status, by[77].status], ['BLOCKED', 'BLOCKED', 'BLOCKED']);
    for (const i of [38, 39, 40, 41, 42, 43, 44, 53, 54, 57, 58, 59, 61, 82]) assert.ok(['READY_LOCAL'].includes(by[i].status), String(i));
  });
  it('sensitivity: even with every live-evidence item at PARTIAL, or every recurring item only DESIGNED, the target still holds', () => {
    assert.ok(m.sensitivity.items_53_62_all_PARTIAL >= 75);
    assert.ok(m.sensitivity.items_63_74_all_DESIGNED >= 75);
  });
  it('every status agrees with the package record that owns the item', () => {
    for (const i of [38, 39, 40, 41, 42, 43, 44]) assert.equal(infra.item_status[String(i)], by[i].status, String(i));
    for (const i of [45, 46, 47, 48, 49, 50, 51, 52, 59]) assert.equal(canary.master_checklist_disposition[String(i)].split(' ')[0], by[i].status, String(i));
    for (let i = 63; i <= 74; i++) assert.equal(recurring.items[String(i)].status, by[i].status, String(i));
    for (let i = 75; i <= 84; i++) assert.equal(later.items[String(i)].status, by[i].status, String(i));
    assert.equal(canary.FIRST_HEALTH_STATISTICS_CANARY_PACKAGE, 'FROZEN_V1');
  });
  it('the human table is generated from the same data and every referenced record exists', () => {
    const md = readFileSync('docs/STATISTICS-MASTER-READINESS.md', 'utf8');
    assert.match(md, new RegExp(`LOCAL_READY_SCORE = ${m.totals.LOCAL_READY_SCORE}%`));
    assert.match(md, new RegExp(`STRICT_COMPLETION = ${m.totals.STRICT_COMPLETION_PERCENT}%`));
    assert.equal((md.match(/^\| \d\d \|/gm) ?? []).length, 84);
    for (const f of m.references) assert.ok(existsSync(f), f);
  });
});
