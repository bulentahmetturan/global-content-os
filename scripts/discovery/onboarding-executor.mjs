#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('../..', import.meta.url)));
const EVIDENCE_TTL_MS = 72 * 60 * 60 * 1000;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

async function requestJson(baseUrl, token, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`DISCOVERY_API_${response.status}: ${result.error || 'request failed'}`);
  return result;
}

function runLifecycle(command, source) {
  const args = [
    join(ROOT, 'scripts', 'source-lifecycle.mjs'),
    command,
    source.lifecycle_target,
    '--url',
    source.source_uri,
    '--channel',
    source.lifecycle_channel,
    '--json',
  ];
  if (command === 'add') args.push('--apply');
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    env: process.env,
  });
  if (result.error) throw result.error;
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout || '').trim());
  } catch {
    throw new Error(`SOURCE_LIFECYCLE_INVALID_JSON: ${String(result.stderr || result.stdout || '').slice(-1000)}`);
  }
  return { exitCode: result.status, result: parsed };
}

function d4Expired(source, packageVersionMatches) {
  let timestamp = Number.NaN;
  try {
    timestamp = Date.parse(source.d4_evidence_json ? JSON.parse(source.d4_evidence_json)?.observedAt : '');
  } catch {
    return true;
  }
  return !packageVersionMatches || !Number.isFinite(timestamp) || Date.now() - timestamp < 0 || Date.now() - timestamp > EVIDENCE_TTL_MS;
}

function resultDisposition(exitCode, lifecycle) {
  const outcome = String(lifecycle?.outcome || '');
  if (['ACTIVE', 'ALREADY_ACTIVE'].includes(outcome) && exitCode === 0) return 'ACTIVE';
  if (/ACCESS|TERMS|AUTH|RESTRICTED/.test(outcome)) return 'RESTRICTED';
  if (['CHANGE_PREPARED', 'PLAN_ONLY', 'NEEDS_USER_DECISION', 'READY'].includes(outcome)) return 'MANUAL_INTAKE';
  if (exitCode === 0 && lifecycle?.ok === true) return 'ACTIVE';
  return 'FAILED';
}

export async function processIntent(baseUrl, token, intent, dependencies = {}) {
  const lifecycle = dependencies.runLifecycle || runLifecycle;
  const request = dependencies.requestJson || requestJson;
  const candidate = intent.candidate || {};
  const packageMatches = candidate.admission_package_version === intent.admission_package_version;
  let active = 0;
  let partial = 0;
  let failed = 0;

  for (const source of intent.sources || []) {
    let outcome;
    let lifecycleResult;
    let evidenceRef = source.d4_evidence_ref || null;
    if (source.source_disposition === 'RESTRICTED') {
      outcome = 'RESTRICTED';
      lifecycleResult = { outcome: 'RESTRICTED', reason: 'ACCESS_OR_TERMS_RESTRICTED' };
    } else if (
      source.source_disposition === 'MANUAL_INTAKE' ||
      !source.lifecycle_target ||
      !source.lifecycle_channel
    ) {
      outcome = 'MANUAL_INTAKE';
      lifecycleResult = { outcome: 'MANUAL_INTAKE', reason: 'UNSUPPORTED_OR_UNPROVEN_SOURCE' };
    } else {
      const stale = d4Expired(source, packageMatches);
      try {
        if (stale) {
          const refreshed = lifecycle('plan', source);
          lifecycleResult = { d4Rerun: true, packageVersionChanged: !packageMatches, plan: refreshed.result };
          const evidencePath = join(
            ROOT,
            '.logs',
            'discovery-admission',
            'executor-refresh',
            `intent-${encodeURIComponent(intent.intent_id)}`,
            `source-${encodeURIComponent(source.source_id)}.json`,
          );
          await mkdir(join(ROOT, '.logs', 'discovery-admission', 'executor-refresh', `intent-${encodeURIComponent(intent.intent_id)}`), { recursive: true });
          await writeFile(evidencePath, `${JSON.stringify({
            schema: 'D4_EXECUTOR_REFRESH_V1',
            intentId: intent.intent_id,
            candidateId: candidate.candidate_id,
            admissionPackageVersion: intent.admission_package_version,
            sourceId: source.source_id,
            sourceUri: source.source_uri,
            observedAt: new Date().toISOString(),
            lifecyclePlan: refreshed.result,
          }, null, 2)}\n`, 'utf8');
          evidenceRef = evidencePath;
          if (refreshed.exitCode !== 0 || refreshed.result?.ok !== true) {
            outcome = 'MANUAL_INTAKE';
          }
        }
        if (!outcome) {
          const applied = lifecycle('add', source);
          lifecycleResult = { ...lifecycleResult, d4Rerun: stale, lifecycle: applied.result };
          outcome = resultDisposition(applied.exitCode, applied.result);
        }
      } catch (error) {
        outcome = 'FAILED';
        lifecycleResult = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    if (outcome === 'ACTIVE') active++;
    else if (outcome === 'FAILED') failed++;
    else partial++;

    await request(baseUrl, token, '/api/discovery/executor/results', {
      intentId: intent.intent_id,
      sourceId: source.source_id,
      outcome,
      lifecycleResult,
      evidenceRef,
    });
  }
  const finalized = await request(baseUrl, token, '/api/discovery/executor/finalize', {
    intentId: intent.intent_id,
  });
  return { intentId: intent.intent_id, active, partial, failed, finalized };
}

async function main() {
  const baseUrl = new URL(requiredEnv('GCOS_HUB_URL')).toString();
  const token = requiredEnv('DISCOVERY_EXECUTOR_TOKEN');
  const once = process.argv.includes('--once');
  const results = [];
  while (true) {
    const { intent } = await requestJson(baseUrl, token, '/api/discovery/executor/claim', {});
    if (!intent) break;
    results.push(await processIntent(baseUrl, token, intent));
    if (once) break;
  }
  console.log(JSON.stringify({ processed: results.length, results }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
