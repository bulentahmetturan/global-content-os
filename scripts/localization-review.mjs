#!/usr/bin/env node
// Localization review queue (P5): REVIEW_REQUIRED flags from stored localization feedback + localization stats.
//   node scripts/localization-review.mjs queue [--remote | --file inputs.json] [--days 30]
// Read-only. Remote reads are SELECT-only (`wrangler d1 execute --remote`). Nothing here writes D1, the registry, a model/prompt
// default or lifecycle state: a flag is a signal for an operator, who may choose prompt improvement, model change, a
// source-type policy recalibration, a source-specific extraction fix, an evidence extractor fix or a source-lifecycle
// re-canary -- each change goes through a bounded canary and a reviewed commit / explicit authorization.
// Aggregation dimensions: source, source type, title / summary model, title / summary path, failure reason, contract, language.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export async function loadModule() {
  const out = join(tmpdir(), `localization-feedback-${process.pid}.mjs`);
  await build({ entryPoints: [join(root, 'apps/worker/src/localize/localization-feedback.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

function remoteRows(sql) {
  const cmd = `npx wrangler d1 execute global-content-os --remote --json --command "${sql.replace(/\s+/g, ' ').replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

export async function buildQueue({ feedback, stats }) {
  const m = await loadModule();
  const aggregates = m.aggregateLocalizationFeedback(feedback);
  return { review_required: m.reviewQueue(aggregates, stats), aggregates: aggregates.slice(0, 30), failure_breakdown: m.failureBreakdown(stats).slice(0, 30), actions: m.REVIEW_ACTIONS };
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd !== 'queue') {
    console.error('usage: localization-review queue [--remote | --file inputs.json] [--days N]');
    return 2;
  }
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
  const days = Number(opt('--days') || 30);
  let inputs;
  if (rest.includes('--remote')) {
    const m = await loadModule();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    inputs = {
      feedback: remoteRows(m.FEEDBACK_SQL.replace('?', `'${since}'`)),
      stats: remoteRows(m.STATS_SQL.replace('?', `'${since}'`)),
    };
  } else if (opt('--file')) {
    inputs = JSON.parse(readFileSync(opt('--file'), 'utf8'));
  } else {
    console.error('need --remote or --file');
    return 2;
  }
  console.log(JSON.stringify(await buildQueue(inputs), null, 1));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('localization-review.mjs')) main(process.argv.slice(2)).then((c) => process.exit(c));
