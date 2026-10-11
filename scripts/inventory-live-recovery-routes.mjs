// Source stays local. Emit route/method/handler metadata only, no executable snippets.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const routes = JSON.parse(readFileSync('.logs/live-baseline-reproduction.json','utf8')).routeLiteralComparison.liveOnly;
const live = ts.createSourceFile('live.js',readFileSync('.logs/authorized-operator-evidence-20261011/module-1.bin','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const current = readFileSync('apps/worker/src/index.ts','utf8');
const candidates = ['7b61870','151a471','8d18b38','44f2045'];
const historical = Object.fromEntries(candidates.map(ref => [ref,execFileSync('git',['show',ref+':apps/worker/src/index.ts'],{encoding:'utf8'})]));
const results = routes.map(route => {
  const branches = [];
  function walk(node) {
    if (ts.isIfStatement(node)) {
        const literals = []; const calls = new Set();
      function condition(child) { if (ts.isStringLiteral(child)) literals.push(child.text); ts.forEachChild(child,condition); }
      condition(node.expression);
      if (literals.includes(route)) {
        const tokens = new Set(); let inlineD1Prepare = false;
        function handler(child) {
          if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) calls.add(child.expression.text);
          if (ts.isPropertyAccessExpression(child) && /TOKEN$/.test(child.name.text)) tokens.add(child.name.text);
          if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === 'prepare') inlineD1Prepare = true;
          ts.forEachChild(child,handler);
        }
        handler(node.thenStatement);
        branches.push({ methods:literals.filter(value => ['GET','POST','PUT','DELETE','PATCH'].includes(value)),
          referencedHandlers:[...calls].filter(name => !['json','json6','String','Number','Boolean','Date','Error'].includes(name)).sort(),
          tokenReferences:[...tokens].sort(),inlineD1Prepare });
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(live);
  return { route,module:'index.js',owner:route.includes('doctor-onboarding')?'Doctors (shared OPS auth)':'Discovery (shared Worker/auth)',
    kind:route==='/api/discovery/'?'PREFIX_AUTH_GUARD_NOT_STANDALONE_ENDPOINT':'ROUTE_LITERAL_BRANCH',
    liveBranches:branches,currentIndexPresence:current.includes(route),
    historicalIndexPresence:Object.fromEntries(candidates.map(ref => [ref,historical[ref].includes(route)])),
    classification:historical['7b61870'].includes(route)?'UNKNOWN':'MISSING_SOURCE',
    classificationScope:'Stamped snapshot only; history/current presence does not prove deployed source lineage',
    buildInclusion:'Static index.ts entrypoint branching, no build-time conditional identified; production request execution subject to auth/runtime checks',
    featureFlags:'No route-specific build flag proven; presence does not authorize execution or source activation' };
});
writeFileSync('.logs/exact-build-route-inventory.json',JSON.stringify({boundedHistoricalCandidates:candidates,routes:results},null,2));
console.log(JSON.stringify(results));
