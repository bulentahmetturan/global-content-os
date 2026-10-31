// One-time repair: fence off the areas the owner rejected on the 30 HSGM legs registered before `add --forbid` existed. Idempotent.
import { readRegistry, writeCanonicalFiles } from '../source-lifecycle/store.mjs';

const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FORBID = ['/tr/mevzuat', '/tr/kamuoyuna-duyuru', '/tr/ihale', '/tr/basin-odasi'];
for (const file of ['adapters/tip-toplulugu-radar/content/source-registry-batch3.json', 'adapters/tip-toplulugu-radar/content/source-registry-egitim-v1.json']) {
  const reg = readRegistry(root, file);
  if (!reg.stable) throw new Error(`${file} is not byte-stable`);
  let n = 0;
  for (const s of reg.data.sources.filter((x) => /^(egitim_)?hsgm_/.test(x.source_id) && x.source_id !== 'hsgm_public_health')) {
    s.fetch_plan.forbidden_path_patterns = [];
    s.fetch_plan.forbidden_paths = FORBID; // the key the radar url_allowed_by_plan actually enforces
    n++;
  }
  writeCanonicalFiles(root, [{ file, text: (JSON.stringify(reg.data, null, 2) + (reg.trailing ? '\n' : '')).split('\n').join(reg.eol) }]);
  console.log(file, n);
}
