#!/usr/bin/env node
// Local-only: builds one Discovery admission input per held-out-free approved expert from the intake file and the source bundles,
// then evaluates it with the real kernel (compileAdmissionPackage) in memory. Writes only release/doctors/expert-admission-inputs-*.json
// (with --write). Never calls production. Statements are honest: no D4 dry-run evidence exists yet and credentials are unverified,
// so every package is expected to evaluate NOT_READY; the report names exactly what is missing.
//   node scripts/doctors-compile-packages.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const IDENTITY_TYPES = ['ORCID', 'INSTITUTIONAL_PROFILE', 'UNIVERSITY_PROFILE', 'PROFESSIONAL_SOCIETY', 'RESEARCHER_PROFILE'];

export function buildInput(person, bundle) {
  const sources = bundle.sources.map((s, i) => ({
    sourceId: `src_${slug(person.canonicalName)}_${i + 1}`,
    sourceType: s.type,
    uri: s.url,
    sourceRole: IDENTITY_TYPES.includes(s.type) ? 'IDENTITY' : 'EVIDENCE',
    d4: null,
  }));
  // A reference counts as verified only with positive evidence: ORCID employment match, or a profile page that loaded (HTTP 200).
  const references = bundle.sources
    .filter((s) => IDENTITY_TYPES.includes(s.type))
    .map((s) => ({ type: s.type, value: s.url, verified: s.type === 'ORCID' ? s.check === 'ORCID_API_NAME_AND_EMPLOYMENT_MATCH' : s.check.startsWith('HTTP_200') }));
  const hasVerified = references.some((r) => r.verified);
  return {
    identity: {
      status: hasVerified ? 'PASS' : 'UNKNOWN',
      canonicalKey: slug(person.canonicalName),
      references,
      doctor: { credentialClass: bundle.credential.startsWith('PHYSICIAN') ? 'PHYSICIAN' : 'SCIENTIST', credentialVerified: false, panel: 'GLOBAL_EXPERT_PANEL' },
    },
    sources,
    dataContract: true,
    routing: { role: 'ANNOUNCEMENT_EVENT', destination: 'GLOBAL_HUB:tip-ogrencileri' },
    provenance: true,
    dedupe: true,
    safety: false,
    observability: true,
    rollback: true,
    commercialReview: false,
  };
}

async function loadKernel() {
  const out = resolve(tmpdir(), `doctors-kernel-${process.pid}.mjs`);
  await build({ entryPoints: [resolve(ROOT, 'apps/worker/src/discovery/kernel.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const intake = read('release/doctors/expert-intake-2026-10-20.json');
  const bundles = read('release/doctors/expert-source-bundles-2026-10-22.json');
  const { compileAdmissionPackage } = await loadKernel();
  const inputs = {};
  const report = [];
  for (const person of intake.approved.filter((p) => !p.hold)) {
    const bundle = bundles.people.find((b) => b.canonicalName === person.canonicalName);
    const input = buildInput(person, bundle);
    inputs[person.canonicalName] = input;
    const pkg = compileAdmissionPackage('DOCTOR', input);
    report.push({ name: person.canonicalName, sources: input.sources.length, dispositions: pkg.sources.map((s) => s.disposition[0]).join(''), ready: pkg.missing.length === 0, missing: pkg.missing });
  }
  console.log(JSON.stringify({ candidates: report.length, ready: report.filter((r) => r.ready).length, report }, null, 1));
  if (process.argv.includes('--write')) {
    writeFileSync(resolve(ROOT, 'release/doctors/expert-admission-inputs-2026-10-22.json'), JSON.stringify({ status: 'LOCAL_NOT_SUBMITTED', note: 'honest inputs: credentialVerified=false, no D4 evidence, safety/commercial review pending owner', inputs }, null, 1) + '\n');
  }
}
