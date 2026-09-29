// Architecture invariants (ADR-0004 in multi_channel_design). These fail loudly if the
// three-system ownership model silently regresses. Sibling-repo checks run only when the
// sibling checkout exists and report a skip otherwise -- they never pass by absence.
// Run: node --test scripts/architecture-invariants.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Centralized sibling resolution: works both under projects/ and projects/content-systems/.
const sibling = (name) => path.resolve(root, '..', name);
const mcd = sibling('multi_channel_design');
const ccos = sibling('channel-content-os');
const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => path.join(root, p);

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', '__pycache__', '.pytest_cache', 'archive', 'legacy-cleanup']);
function walk(dir, exts, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const routes = JSON.parse(read(rel('config/routes.json')));

test('routes.json: every route is owned by global-content-os and has no legacy ownership fields', () => {
  assert.equal(routes.externalPolicyRepo.name, 'multi_channel_design');
  for (const r of routes.routes) {
    assert.equal(r.runtimeOwner, 'global-content-os', r.id);
    for (const legacy of ['sourcesOwnedBy', 'policyRef', 'subscriptionsRef', 'registryRef']) {
      assert.ok(!(legacy in r), `${r.id}: legacy field ${legacy}`);
    }
  }
});

test('routes.json: local runtime references exist in this repo', () => {
  for (const r of routes.routes) {
    for (const key of ['sourceCatalog', 'officialSourcesRef', 'runtimeAdapter', 'subscriptions', 'sourcePolicy', 'audienceScope']) {
      if (r[key]) assert.ok(existsSync(rel(r[key])), `${r.id}.${key} -> ${r[key]} missing`);
    }
  }
});

test('routes.json: external policy references resolve in multi_channel_design', { skip: !existsSync(mcd) && 'multi_channel_design sibling not present' }, () => {
  for (const r of routes.routes) {
    for (const [k, p] of Object.entries(r.externalPolicy ?? {})) {
      assert.ok(existsSync(path.join(mcd, p)), `${r.id}.externalPolicy.${k} -> ${p} missing in multi_channel_design`);
    }
  }
});

test('Hekimler source/audience policy has ONE editable owner: multi_channel_design holds no copy', { skip: !existsSync(mcd) && 'multi_channel_design sibling not present' }, () => {
  for (const name of ['hekimler-source-policy-map.json', 'hekimler-audience-scope.json']) {
    assert.ok(existsSync(rel(`adapters/hekimler-radar/content/policies/${name}`)), `${name} must exist in global-content-os`);
    assert.ok(!existsSync(path.join(mcd, 'channels/tip-ogrencileri-platformu/content/policies', name)), `${name} must not be duplicated in multi_channel_design`);
  }
  for (const name of ['hekimler-source-policy-map.schema.json', 'hekimler-candidate-decision.schema.json']) {
    assert.ok(existsSync(rel(`adapters/hekimler-radar/content/schemas/${name}`)), `${name} schema must live beside the runtime`);
    assert.ok(!existsSync(path.join(mcd, 'design-system/schemas/src', name)), `${name} schema must not be duplicated in multi_channel_design`);
  }
});

test('Kaduse news subscriptions have ONE editable owner: global-content-os', { skip: !existsSync(mcd) && 'multi_channel_design sibling not present' }, () => {
  assert.ok(existsSync(rel('packages/source-catalog/data/kaduse-subscriptions.json')));
  assert.ok(!existsSync(path.join(mcd, 'channels/kaduse-medikal/content/news-sources.json')), 'news-sources.json must not exist in multi_channel_design');
});

test('feeds generation reads ONLY local canonical inputs (no sibling-repo reads) and feeds.json carries provenance', () => {
  const gen = read(rel('scripts/sync-feeds.mjs'));
  assert.ok(!/multi_channel_design|channel-content-os/.test(gen.replace(/\/\*[\s\S]*?\*\//, '')), 'sync-feeds.mjs must not reference sibling repos');
  const feeds = JSON.parse(read(rel('config/feeds.json')));
  assert.equal(feeds.provenance.generatedBy, 'scripts/sync-feeds.mjs');
  assert.equal(feeds.provenance.editable, false);
  for (const i of feeds.provenance.inputs) assert.ok(existsSync(rel(i.path)), `provenance input missing: ${i.path}`);
});

test('no active runtime scrapes another registry via regex over TypeScript or sibling files', () => {
  const files = [...walk(rel('scripts'), ['.mjs']), ...walk(rel('apps/worker/src'), ['.ts']), ...walk(rel('adapters/hekimler-radar/radar'), ['.py']), ...walk(rel('adapters/hekimler-radar/scripts'), ['.py'])].filter(
    (f) => !f.endsWith('architecture-invariants.test.mjs')
  );
  const bad = /(source-registry|global-source-registry)\.ts/;
  for (const f of files) assert.ok(!bad.test(read(f)), `${path.relative(root, f)} reads a TS registry file`);
});

test('post-approval claim routing is not in the source catalog (it belongs to channel-content-os)', () => {
  assert.ok(!existsSync(rel('packages/source-catalog/src/research/claim-routing.ts')));
});

test('no active documentation says the Global Hub / source monitoring is owned by channel-content-os', () => {
  const docs = [...walk(rel('docs'), ['.md']), rel('README.md'), ...walk(rel('adapters'), ['README.md'])];
  const historical = /originally|historical|superseded|relocated|previously|formerly|used to|ADR-0003|was assigned|at the time|until ADR-0004/i;
  const claim = /(global (news )?hub|source[- ]monitoring|source registry)[^.\n]{0,80}owned by[^.\n]{0,40}channel-content-os|owned by (this repo )?\(?`?channel-content-os`?\)?[^.\n]{0,60}(global (news )?hub|source registry)/i;
  for (const f of docs) {
    const lines = read(f).split(/\r?\n/);
    lines.forEach((line, i) => {
      if (claim.test(line) && !historical.test(line) && !historical.test(lines[i - 1] ?? '') && !historical.test(lines[i + 1] ?? '')) {
        assert.fail(`${path.relative(root, f)}:${i + 1} claims channel-content-os owns the Hub: ${line.trim()}`);
      }
    });
  }
});

test('the relocated global-news-hub contract carries its relocation banner', () => {
  assert.match(read(rel('docs/global-news-hub-contract.md')), /Relocated \(2026-09-29, ADR-0004\)/);
});

test('exactly one canonical Hekimler runtime in this repo; tip-radar is marked LEGACY', () => {
  assert.ok(existsSync(rel('adapters/hekimler-radar/radar/hekimler_continuous_runner.py')));
  assert.match(read(rel('adapters/tip-radar/README.md')), /LEGACY \/ MIGRATION COMPATIBILITY ONLY/);
  // No second copy of the Hekimler engine elsewhere in this repo.
  const engines = walk(root, ['hekimler_continuous_runner.py']);
  assert.equal(engines.length, 1, engines.join(', '));
});

test('multi_channel_design keeps no executable Hekimler runtime', { skip: !existsSync(mcd) && 'multi_channel_design sibling not present' }, () => {
  const tip = path.join(mcd, 'channels/tip-ogrencileri-platformu');
  for (const dir of ['radar', 'scripts', 'sources', 'tests', 'database']) {
    assert.ok(!existsSync(path.join(tip, dir)), `${dir}/ must not exist in multi_channel_design`);
  }
  assert.equal(walk(tip, ['.py']).length, 0, 'no python runtime under the tip channel pack');
  assert.ok(!existsSync(path.join(mcd, 'radar')), 'top-level radar/ scaffold stays retired');
});

test('channel-content-os owns no source acquisition (research/ holds post-approval claim routing only)', { skip: !existsSync(ccos) && 'channel-content-os sibling not present' }, () => {
  assert.ok(!existsSync(path.join(ccos, 'mcp-server/src/news')), 'mcp-server/src/news must not exist in channel-content-os');
  const research = path.join(ccos, 'mcp-server/src/research');
  if (existsSync(research)) {
    for (const name of readdirSync(research)) {
      assert.match(name, /^claim-(routing|vocabulary)(\.test)?\.ts$/, `mcp-server/src/research/${name} is not post-approval claim code`);
    }
  }
  assert.ok(!existsSync(path.join(ccos, 'docs/global-news-hub-contract.md')), 'Hub contract must live in global-content-os');
});

test('no script/adapter code depends on files that moved out of channel-content-os or multi_channel_design', () => {
  const files = [...walk(rel('scripts'), ['.mjs', '.py']), ...walk(rel('adapters/hekimler-radar/radar'), ['.py']), ...walk(rel('adapters/hekimler-radar/scripts'), ['.py'])].filter(
    (f) => !f.endsWith('architecture-invariants.test.mjs')
  );
  const banned = [
    /channel-content-os['"\/\\]+mcp-server[\/\\]src[\/\\](news|research)/,
    /multi_channel_design\/channels\/tip-ogrencileri-platformu\/(radar|scripts|sources|database)/,
    /['"]channel-content-os['"],\s*['"]mcp-server['"]/,
  ];
  for (const f of files) {
    const text = read(f);
    for (const re of banned) assert.ok(!re.test(text), `${path.relative(root, f)} matches ${re}`);
  }
});

test('no machine-specific absolute project paths in tracked scripts/docs/config', () => {
  const files = [
    ...walk(rel('scripts'), ['.mjs', '.py', '.sql']),
    ...walk(rel('adapters'), ['.py', '.mjs']),
    ...walk(rel('apps'), ['.ts', '.mjs']),
    ...walk(rel('config'), ['.json']),
    ...walk(rel('.github'), ['.yml']),
  ].filter((f) => !f.endsWith('architecture-invariants.test.mjs'));
  const re = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+[\\/]+(Desktop[\\/]+projects|\.cursor)/i;
  for (const f of files) {
    assert.ok(!re.test(read(f)), `${path.relative(root, f)} contains a machine-specific absolute path`);
  }
});

test('the worker does not import channel or design runtime, and CCOS is reached only through the handoff', () => {
  const files = walk(rel('apps/worker/src'), ['.ts']);
  for (const f of files) {
    const text = read(f);
    assert.ok(!/from ['"][^'"]*(channel-content-os|multi_channel_design)/.test(text), `${path.relative(root, f)} imports a sibling repo`);
  }
});

test('approved_brief doc describes the implemented CCOS ingest (no stale stub-only statement)', () => {
  const doc = read(rel('docs/approved-brief-handoff.md'));
  assert.doesNotMatch(doc, /This slice does \*\*not\*\* change CCOS/);
  assert.match(doc, /POST \/api\/handoff\/approved-brief/);
});

test('source catalog package exists with its tests', () => {
  assert.ok(statSync(rel('packages/source-catalog/src/news/global-source-registry.ts')).isFile());
  assert.ok(statSync(rel('packages/source-catalog/src/research/source-registry.ts')).isFile());
});
