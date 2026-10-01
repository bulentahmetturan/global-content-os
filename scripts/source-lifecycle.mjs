#!/usr/bin/env node
// Source Lifecycle Orchestrator -- the single operator/agent entry point (docs/SOURCE-LIFECYCLE.md).
//
//   node scripts/source-lifecycle.mjs add         "<name | url | source_id>" [--url U] [--channel C] [--history DIR ...] [--apply]
//   node scripts/source-lifecycle.mjs retire      "<source_id | name | url>" [--reason R] [--apply]
//   node scripts/source-lifecycle.mjs reactivate  "<source_id>" [--history DIR ...] [--apply]
//   node scripts/source-lifecycle.mjs inspect     "<source_id | name | url>"
//   node scripts/source-lifecycle.mjs plan        "<name | url>"            (= add without --apply)
//   node scripts/source-lifecycle.mjs recalibrate "<source_id>" [--apply]
//   node scripts/source-lifecycle.mjs purge-plan  "<source_id>"             (dry-run dependency report only)
//   add / reactivate / recalibrate also take --localization-sample FILE ([{title, excerpt, url?}]) and need HUB_OPERATOR_TOKEN for the localization canary (G8b).
//   add --json for machine-readable output. Without --apply nothing is written (dry run).
//
// Exit: 0 done / dry-run ok, 3 needs user decision, 4 blocked (access/capacity/technical), 1 error/denied, 2 usage.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createLifecycle } from './source-lifecycle/orchestrator.mjs';
import { localizerFromEnv } from './source-lifecycle/localization.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = ['add', 'retire', 'reactivate', 'inspect', 'plan', 'recalibrate', 'purge-plan'];

function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  const o = { cmd, target, history: [], apply: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--json') o.json = true;
    else if (a === '--url') o.url = rest[++i];
    else if (a === '--channel') o.channel = rest[++i];
    else if (a === '--reason') o.reason = rest[++i];
    else if (a === '--localization-sample') o.localizationSample = rest[++i];
    else if (a === '--history') while (rest[i + 1] && !rest[i + 1].startsWith('--')) o.history.push(rest[++i]);
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function exitCode(r) {
  if (!r.ok && /DENIED|AUTH/.test(r.outcome + (r.commit?.code || ''))) return 1;
  if (r.outcome === 'NEEDS_USER_DECISION') return 3;
  if (/^BLOCKED_/.test(r.outcome)) return 4;
  return r.ok ? 0 : 1;
}

export function human(r) {
  const g = r.gates ? Object.entries(r.gates).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  const lines = [`${(r.op || '').toUpperCase()} ${r.source_id || r.source?.source_id || ''} -> ${r.outcome}`.trim()];
  if (g) lines.push(`GATES ${g}`);
  if (r.endpoint) lines.push(`ENDPOINT=${r.endpoint.url} TRANSPORT=${r.endpoint.transport} RUNTIME=${r.endpoint.runtime}${r.endpoint.note ? ` (${r.endpoint.note})` : ''}`);
  if (r.route) lines.push(`ROUTE=${r.route.lane}/${r.route.heading} CHANNEL=${r.route.channelId} TIER=${r.route.source_tier ?? '-'}`);
  if (r.cadence) lines.push(`CADENCE=${r.cadence.poll_minutes}min (${r.cadence.confidence}${r.cadence.flags?.length ? `; ${r.cadence.flags.join(',')}` : ''})`);
  if (r.migration) lines.push(`MIGRATION=${r.migration} D1=${[...(r.d1?.upserts || []), ...(r.d1?.disables || []).map((d) => `${d} disable`)].join(',')} (remote apply needs explicit authorization)`);
  if (r.capacity) lines.push(`CAPACITY=${r.capacity.status}`);
  if (r.canary) lines.push(`CANARY=${r.canary.gate} candidates=${r.canary.candidates} published=0`);
  if (r.localization) {
    const m = r.localization.measurements || {};
    lines.push(`LOCALIZATION=${r.localization.class} language=${r.localization.source_language}${r.localization.reason ? ` (${r.localization.reason})` : ''}${m.foreign_items ? ` titles=${Math.round(m.title_success_rate * 100)}% grounded_summaries=${Math.round(m.grounded_summary_rate * 100)}% insufficient_evidence=${Math.round(m.insufficient_evidence_rate * 100)}% leaks=${m.english_or_foreign_leak} unsupported=${m.unsupported_claim} inversion=${m.subject_inversion} numeric_entity=${m.numeric_or_entity_error} garbled=${m.garbled}` : ''}`);
  }
  if (r.activation) lines.push(`ACTIVATION=${r.activation}`);
  if (r.question) lines.push(`QUESTION: ${r.question}`);
  if (r.next_step) lines.push(`NEXT: ${r.next_step}`);
  if (r.plan) lines.push(...r.plan.map((s, i) => `PLAN ${i + 1}. ${s}`));
  if (r.commit) lines.push(`COMMIT=${r.commit.outcome} ${r.commit.file || ''}`.trim());
  if (r.commits) lines.push(...r.commits.map((c) => `COMMIT=${c.outcome} ${c.file}`));
  if (r.steps?.O5_artifacts) lines.push(`ARTIFACTS refs=${r.steps.O5_artifacts.references_total} ${JSON.stringify(r.steps.O5_artifacts.action_counts)} deletions=0`);
  if (r.source) lines.push(`STATE=${r.source.state} LANE=${r.source.lane} ACTIVATION=${r.source.runtime_activation ?? r.source.status} CADENCE=${r.source.cadence_minutes ?? '-'}min`);
  if (r.trace_file) lines.push(`TRACE=${r.trace_file}`);
  return lines.join('\n');
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (!COMMANDS.includes(o.cmd) || !o.target) {
    console.error(`usage: source-lifecycle <${COMMANDS.join('|')}> "<target>" [options]  (see file header)`);
    return 2;
  }
  // The operator's explicit command + --apply is the authorization; feedback/automation actors are refused in store.
  const localizationSample = o.localizationSample ? JSON.parse(readFileSync(o.localizationSample, 'utf8')) : null;
  const lc = createLifecycle({ root, history: o.history, localizer: localizerFromEnv(), localizationSample, actor: { kind: 'operator', id: process.env.USER || process.env.USERNAME || 'operator' }, authorize: () => o.apply === true });
  let r;
  if (o.cmd === 'add' || o.cmd === 'plan') r = await lc.add(o.target, { url: o.url, channel: o.channel, apply: o.cmd === 'add' && o.apply });
  else if (o.cmd === 'retire') r = await lc.retire(o.target, { reason: o.reason, apply: o.apply });
  else if (o.cmd === 'reactivate') r = await lc.reactivate(o.target, { apply: o.apply });
  else if (o.cmd === 'inspect') r = lc.inspect(o.target);
  else if (o.cmd === 'recalibrate') r = await lc.recalibrate(o.target, { apply: o.apply });
  else r = lc.purgePlan(o.target);
  console.log(o.json ? JSON.stringify(r, null, 1) : human(r));
  return exitCode(r);
}

if (process.argv[1] && process.argv[1].endsWith('source-lifecycle.mjs')) {
  main().then((c) => process.exit(c), (e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}
