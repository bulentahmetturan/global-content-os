// Local-only bounded comparison. Never emits source or modifies captured artifacts.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const hash = value => createHash('sha256').update(value).digest('hex');
const live = readFileSync('.logs/authorized-operator-evidence-20261011/module-1.bin');
const rebuilt = readFileSync('.logs/live-baseline-build/index.js');
const wanted = ['upsertSourceItem','updateExistingItem','enrichOneItem','runEnrichmentBatch','gatherReadiness','runDossierRecurringTick','runStatisticsScheduledTick'];
function inventory(bytes) {
  const tree = ts.createSourceFile('worker.js', bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const printer = ts.createPrinter({ removeComments: true });
  const functions = {}, routes = new Set();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.includes(node.name.text))
      functions[node.name.text] = hash(printer.printNode(ts.EmitHint.Unspecified, node, tree));
    if (ts.isStringLiteral(node) && node.text.startsWith('/api/')) routes.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(tree); return { functions, routes: [...routes].sort(), parseErrors: tree.parseDiagnostics.length };
}
const a = inventory(live), b = inventory(rebuilt);
const ref = '7b61870ca8562eb644adf8b117e816ab7958e2c7';
const lock = execFileSync('git', ['show', ref + ':package-lock.json']);
const report = {
  sourceCandidate: ref, sourceCandidateBasis: 'UNTRUSTED_BUILD_STAMP_USED_AS_ONE_BOUNDED_SEARCH_CANDIDATE_ONLY',
  activeVersionEvidence: '.logs/authorized-operator-evidence-20261011/artifact-bracket.json',
  lockSHA256: hash(lock), installedLockSHA256: hash(readFileSync('package-lock.json')),
  installedWrangler: JSON.parse(readFileSync('node_modules/wrangler/package.json')).version,
  installedEsbuild: JSON.parse(readFileSync('node_modules/esbuild/package.json')).version,
  build: 'LOCAL_WRANGLER_DEPLOY_DRY_RUN_NO_UPLOAD',
  liveArtifactSHA256: hash(live), liveBytes: live.length, rebuiltArtifactSHA256: hash(rebuilt), rebuiltBytes: rebuilt.length,
  exactBytesMatch: live.equals(rebuilt), parseErrors: { live: a.parseErrors, rebuilt: b.parseErrors },
  selectedFunctionFingerprints: wanted.map(name => ({ name, live: a.functions[name] ?? null, rebuilt: b.functions[name] ?? null,
    equal: Boolean(a.functions[name] && a.functions[name] === b.functions[name]) })),
  routeLiteralComparison: { liveCount: a.routes.length, rebuiltCount: b.routes.length,
    liveOnly: a.routes.filter(route => !b.routes.includes(route)), rebuiltOnly: b.routes.filter(route => !a.routes.includes(route)) },
  sourceLinkage: live.equals(rebuilt) ? 'BYTE_REPRODUCTION_ONLY_BUILD_RECEIPT_STILL_REQUIRED' : 'UNKNOWN',
  replacementAllowed: false, notes: ['Function equality fingerprints are not behavior proof; inequality is not automatically a bug.',
    'No broad ref/archival search. Parent snapshot has the same lockfile; no redundant build attempted.',
    'Source reconciliation requires immutable input/build recipe, including any dirty/untracked inputs and exact flags.'],
};
writeFileSync('.logs/live-baseline-reproduction.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ liveArtifactSHA256: report.liveArtifactSHA256, rebuiltArtifactSHA256: report.rebuiltArtifactSHA256,
  exactBytesMatch: report.exactBytesMatch, selectedEqualFunctions: report.selectedFunctionFingerprints.filter(item => item.equal).length,
  selectedFunctions: wanted.length, sourceLinkage: report.sourceLinkage, replacementAllowed: false }));
