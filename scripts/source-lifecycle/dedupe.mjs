// G6 -- dedupe / domain-heading ownership. The S66 one-primary-heading rule is evaluated by the existing Python
// check (adapters/tip-toplulugu-radar/scripts/check_source_identity.py) through the bridge; the Node fallback applies the
// same rule shape only when the bridge is unavailable and says so.
import { normalizeUrl, registrableDomain } from './catalog.mjs';

const BURS_EGITIM = new Set(['BURS', 'EGITIM']);

export function dedupeGate({ candidate, sample = [], projections, identityCheck = null, knownItemUrls = null }) {
  const checks = {};
  const explanation = [];
  const url = normalizeUrl(candidate.url);

  const urlHolders = projections.filter((p) => p.source_id !== candidate.source_id && p.urls.includes(url));
  checks.canonical_url = urlHolders.length ? { status: 'FAIL', holders: [...new Set(urlHolders.map((p) => p.source_id))] } : { status: 'PASS' };
  if (urlHolders.length) explanation.push(`endpoint already registered by ${checks.canonical_url.holders.join(', ')}`);

  const dom = registrableDomain(url);
  const holders = projections.filter((p) => p.source_id !== candidate.source_id && !p.retired && p.urls.some((u) => registrableDomain(u) === dom));
  const headings = new Set([candidate.heading, ...holders.map((h) => h.heading)]);
  if (identityCheck) {
    const r = identityCheck(candidate);
    checks.ownership = r.violations?.length ? { status: 'FAIL', basis: 'check_source_identity.py', violations: r.violations } : { status: 'PASS', basis: 'check_source_identity.py' };
  } else {
    const ok = headings.size <= 1 || (headings.size === 2 && [...headings].every((h) => BURS_EGITIM.has(h)));
    checks.ownership = { status: ok ? 'PASS' : 'FAIL', basis: 'node-fallback (bridge unavailable)', headings: [...headings] };
  }
  if (checks.ownership.status === 'FAIL') explanation.push(`${dom} already feeds heading(s) ${[...new Set(holders.map((h) => h.heading))].join('/')} via ${[...new Set(holders.map((h) => h.source_id))].join(', ')}`);
  const sameHeading = holders.filter((h) => h.heading === candidate.heading);
  if (sameHeading.length) explanation.push(`same domain + heading already covered by ${[...new Set(sameHeading.map((h) => h.source_id))].join(', ')} (distinct path; item-level dedupe_key still collapses repeats)`);

  const norm = sample.map((s) => normalizeUrl(s.url)).filter(Boolean);
  const unique = new Set(norm);
  checks.sample = { items: norm.length, unique: unique.size, intra_duplicates: norm.length - unique.size };
  if (knownItemUrls) {
    const overlap = [...unique].filter((u) => knownItemUrls.has(u)).length;
    const ratio = unique.size ? overlap / unique.size : 0;
    checks.known_item_overlap = { overlap, ratio: Math.round(ratio * 100) / 100, status: ratio >= 0.5 ? 'FAIL' : 'PASS' };
    if (ratio >= 0.5) explanation.push(`${overlap}/${unique.size} sampled items already arrive via another source`);
  } else {
    checks.known_item_overlap = { status: 'NOT_EVALUATED', reason: 'no item index supplied; runtime dedupe (source_items dedupe_key, decided_links) remains authoritative' };
  }

  const fail = checks.canonical_url.status === 'FAIL' || checks.ownership.status === 'FAIL' || checks.known_item_overlap.status === 'FAIL';
  return {
    gate: fail ? 'NEEDS_USER_DECISION' : 'PASS',
    checks,
    explanation,
    ...(fail ? { question: `Another source already supplies this material (${explanation[0]}). Add anyway under a different heading, or keep the existing owner?` } : {}),
  };
}
