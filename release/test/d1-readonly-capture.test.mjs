import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../d1-readonly-capture.sql', import.meta.url), 'utf8');
const statements = sql.split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).join('\n')
  .split(';').map(s => s.trim()).filter(Boolean);

test('production D1 capture file contains only SELECT and PRAGMA table_info statements', () => {
  assert.ok(statements.length >= 3);
  for (const s of statements) {
    assert.match(s, /^(SELECT\s|PRAGMA table_info\([a-z_]+\)$)/i, s);
    assert.doesNotMatch(s, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|VACUUM|WRITABLE_SCHEMA)\b/i, s);
  }
});

test('capture pragma targets exist as tables in the committed migrations', () => {
  const dir = new URL('../../migrations/', import.meta.url);
  const names = [...sql.matchAll(/PRAGMA table_info\(([a-z_]+)\)/g)].map(m => m[1]);
  assert.ok(names.length >= 6);
  const all = ['0048_doctor_discovery_candidates','0049_doctor_source_proposals','0046_discovery_signal_linkage','0047_doctor_knowledge','0050_doctor_profile_facts','0044_shared_discovery_kernel']
    .map(n => readFileSync(new URL(n + '.sql', dir), 'utf8')).join('\n');
  for (const n of names) assert.match(all, new RegExp(`(CREATE TABLE( IF NOT EXISTS)? ${n}\\b|ALTER TABLE ${n}\\b)`), n);
});
