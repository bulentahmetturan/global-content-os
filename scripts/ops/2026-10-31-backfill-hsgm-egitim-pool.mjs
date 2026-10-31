// One-time repair: the first 10 HSGM Eğitim legs were registered before lifecycle `add` mirrored the central pool.
// Adds their egitim/pool.json entries through the same builder the lifecycle now uses. Idempotent.
import { readRegistry, writeCanonicalFiles } from '../source-lifecycle/store.mjs';
import { poolEntryFor } from '../source-lifecycle/profile.mjs';

const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const reg = readRegistry(root, 'adapters/tip-toplulugu-radar/content/source-registry-egitim-v1.json');
const poolFile = 'adapters/tip-toplulugu-radar/content/egitim/pool.json';
const pool = readRegistry(root, poolFile);
// pool.json was hand-written with float literals like 10.0, which JSON.stringify prints as 10: one mechanical, value-preserving
// normalisation here lets lifecycle companion writes stay byte-stable from now on.
const have = new Set(pool.data.source_registry.map((s) => s.source_id));
let added = 0;
for (const rec of reg.data.sources.filter((s) => s.source_id.startsWith('egitim_hsgm_') && !have.has(s.source_id))) {
  const poll = rec.cadence_policy?.poll_minutes ?? rec.fetch_plan?.expected_check_interval_minutes ?? 4320;
  pool.data.source_registry.push(poolEntryFor(rec, { heading: 'EGITIM', cadence: { poll_minutes: poll }, today: '2026-10-31' }));
  added++;
}
const text = (JSON.stringify(pool.data, null, 2) + (pool.trailing ? '\n' : '')).split('\n').join(pool.eol);
writeCanonicalFiles(root, [{ file: poolFile, text }]);
console.log('pool entries added:', added);
