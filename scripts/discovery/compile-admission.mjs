#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('../..', import.meta.url)));
const EVIDENCE_ROOT = join(ROOT, '.logs', 'discovery-admission');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function runLifecyclePlan(source) {
  if (!source.lifecycleTarget || !source.lifecycleChannel) return null;
  const result = spawnSync(process.execPath, [
    join(ROOT, 'scripts', 'source-lifecycle.mjs'),
    'plan',
    source.lifecycleTarget,
    '--url',
    source.uri,
    '--channel',
    source.lifecycleChannel,
    '--json',
  ], { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000, env: process.env });
  if (result.error) throw result.error;
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout || '').trim());
  } catch {
    throw new Error(`SOURCE_LIFECYCLE_PLAN_INVALID_JSON: ${String(result.stderr || result.stdout || '').slice(-1000)}`);
  }
  return { exitCode: result.status, result: parsed };
}

export function gatePass(gates, key) {
  const value = gates?.[key];
  return value === true || value === 'PASS' || value === 'READY' || value === 'ACTIVE';
}

export function compileD4(source, probe, artifactPath) {
  const result = probe?.result || {};
  const gates = result.gates || {};
  const outcome = String(result.outcome || '');
  const accessBlocked = /ACCESS|TERMS|AUTH/.test(outcome) ||
    Object.entries(gates).some(([key, value]) => /ACCESS|TERMS|LEGAL/i.test(key) && !gatePass({ value }, 'value'));
  const accessAllowed = gatePass(gates, 'G2') || gatePass(gates, 'ACCESS') || gatePass(gates, 'TERMS');
  const identity = gatePass(gates, 'G1') || gatePass(gates, 'IDENTITY')
    ? 'PASS'
    : probe ? 'FAIL' : 'UNKNOWN';
  const fetch = (gatePass(gates, 'ENDPOINT') || gatePass(gates, 'FETCH')) && accessAllowed
    ? 'PASS'
    : probe ? 'FAIL' : 'UNKNOWN';
  const parser = gatePass(gates, 'PARSER')
    ? 'PASS'
    : probe ? 'FAIL' : 'UNKNOWN';
  return {
    evidenceRef: artifactPath,
    observedAt: new Date().toISOString(),
    identityMatch: identity,
    fetchDryRun: fetch,
    parseDryRun: parser,
    accessTerms: accessBlocked ? 'RESTRICTED' : accessAllowed ? 'ALLOWED' : 'UNKNOWN',
    provenanceClass: source.provenanceClass || 'UNVERIFIED',
    provenanceUri: source.uri,
    sourceItemShapeValid: gatePass(gates, 'CANARY'),
  };
}

async function main() {
  const candidateId = arg('--candidate');
  const inputPath = arg('--input');
  if (!candidateId || !inputPath || !/^[a-zA-Z0-9_-]{1,160}$/.test(candidateId)) {
    throw new Error('Usage: node scripts/discovery/compile-admission.mjs --candidate <id> --input <admission.json>');
  }
  const baseUrl = new URL(requiredEnv('GCOS_HUB_URL'));
  const token = requiredEnv('HUB_OPERATOR_TOKEN');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  if (!Array.isArray(input.sources) || input.sources.length === 0) throw new Error('ADMISSION_SOURCE_BUNDLE_REQUIRED');

  const evidenceDir = join(EVIDENCE_ROOT, candidateId);
  await mkdir(evidenceDir, { recursive: true });
  for (const source of input.sources) {
    let probe;
    let probeError = null;
    try {
      probe = runLifecyclePlan(source);
    } catch (error) {
      probeError = error instanceof Error ? error.message : String(error);
      probe = { exitCode: 1, result: { outcome: 'BLOCKED_TECHNICAL', ok: false, error: probeError } };
    }
    const evidence = compileD4(source, probe, join(evidenceDir, `${encodeURIComponent(source.sourceId)}.json`));
    const artifact = {
      schema: 'D4_ADMISSION_EVIDENCE_V1',
      candidateId,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      sourceRole: source.sourceRole,
      sourceUri: source.uri,
      lifecyclePlan: probe?.result ?? { outcome: 'UNSUPPORTED_SOURCE_TYPE', ok: false },
      probeError,
      evidence,
    };
    await writeFile(evidence.evidenceRef, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    source.d4 = evidence;
    if (evidence.accessTerms === 'RESTRICTED') source.restricted = true;
  }

  const response = await fetch(new URL(`/api/discovery/candidates/${encodeURIComponent(candidateId)}/compile`, baseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ADMISSION_COMPILE_${response.status}: ${result.error || 'request failed'}`);
  console.log(JSON.stringify({ candidateId, state: result.state, missing: result.package?.missing || [], evidenceDir }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
