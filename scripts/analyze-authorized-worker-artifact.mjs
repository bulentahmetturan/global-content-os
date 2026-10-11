// Local artifact analysis: output metadata/hashes only, never executable source.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = '.logs/authorized-operator-evidence-20261011';
const source = readFileSync(`${dir}/module-1.bin`, 'utf8');
const tree = ts.createSourceFile('deployed.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const writers = [], functions = new Set(), routes = new Set();
const sha256 = value => createHash('sha256').update(value).digest('hex');
function visit(node, owner = 'module') {
  if (ts.isFunctionDeclaration(node) && node.name) { owner = node.name.text; functions.add(owner); }
  if (ts.isMethodDeclaration(node) && node.name) owner = node.name.getText(tree);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
    const value = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => '${EXPRESSION}' + span.literal.text).join('') : node.text;
    if (value.startsWith('/api/')) routes.add(value);
    if (/UPDATE\s+source_items\b/i.test(value) && /\b(title|summary|gists_json)\s*=/i.test(value))
      writers.push({ function: owner, sqlSHA256: sha256(value), fields: ['title','summary','gists_json'].filter(field => new RegExp(`\\b${field}\\s*=`,'i').test(value)) });
  }
  ts.forEachChild(node, child => visit(child, owner));
}
visit(tree);
const report = { artifactSHA256: sha256(source), parseErrors: tree.parseDiagnostics.length,
  artifactDefinedWriters: writers, routes: [...routes].sort(),
  expectedProtectionFunctionsPresent: ['protectedProtocolDisplay','protectedBibliographicProtocol'].map(name => ({ name, present: functions.has(name) })),
  manualProtectionErrorPresent: source.includes('APPROVED_PROTOCOL_OPERATOR_WRITER_REQUIRED'),
  approvedIDsPresent: ['dash-item-booklet','dash-item-sodium-2001','dash-item-trial-1997','med-item-dga-2015','med-item-predimed-2018'].map(id => ({ id, present: source.includes(id) })),
  productionActivity: 'UNKNOWN_NO_INVOCATION_PROOF', sourceCommitLinkage: 'UNKNOWN_NO_IMMUTABLE_BUILD_RECEIPT' };
writeFileSync(`${dir}/artifact-analysis.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ artifactSHA256: report.artifactSHA256, parseErrors: report.parseErrors, writerCount: writers.length, protectionFunctions: report.expectedProtectionFunctionsPresent, manualProtectionErrorPresent: report.manualProtectionErrorPresent }));
