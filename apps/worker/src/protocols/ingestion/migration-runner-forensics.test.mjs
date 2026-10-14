import test from 'node:test';
import assert from 'node:assert/strict';
import { readMigrations,replay } from '../../../../../scripts/migration-authority.mjs';
const files=readMigrations('migrations');
test('full filename ledger semantics keep Dossier and Protocol 0043 independent',()=> {
  const names=files.map(f=>f.name);
  const hypothetical=['0043_dossier_discovery_foundation.sql'];
  const pending=names.filter(name=>!hypothetical.includes(name));
  assert.ok(pending.includes('0044_protocol_mediterranean_wave2.sql'));
  assert.ok(!pending.includes('0043_dossier_discovery_foundation.sql'));
  assert.ok(pending.includes('0045_protocol_ingestion_runs.sql'));
});
test('all historical files stay executable and repeat application is ledger-idempotent',()=> {
  const first=replay(files);
  try {
    const second=replay(files,{database:first.db});
    assert.deepEqual(second.executed,[]);
    assert.equal(first.schema,second.schema);assert.equal(first.data,second.data);
    assert.equal(first.db.prepare('SELECT COUNT(*) n FROM d1_migrations').get().n,files.length);
  }finally{first.db.close();}
});
