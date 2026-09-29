// G4 -- routing / content fit. Exactly one channel lane per source; a tie returns NEEDS_USER_DECISION instead of
// fanning a medical source out to every channel. Vocabulary is the canonical one (lanes = feeds.json routes /
// Hekimler registry; headings = S66 HABER/RESEARCH/DUYURU/BURS/EGITIM; tiers/treatments = registry values).
import { hostOf, registrableDomain } from './catalog.mjs';
import { LANES } from './model.mjs';

const CHANNEL_ALIASES = {
  hekimler: 'hekimler',
  'tip-ogrencileri-platformu': 'hekimler',
  'kaduse-news': 'kaduse-news',
  'kaduse-research': 'kaduse-research',
};

const count = (hay, words) => words.reduce((n, w) => n + (hay.match(new RegExp(`\\b${w}`, 'gi')) || []).length, 0);
const AUDIENCE = ['hekim', 'doktor', 'tıp', 'tip fak', 'diş hekim', 'veteriner', 'tus', 'ydus', 'asistan', 'uzmanlık', 'residency', 'fellowship', 'scholarship', 'usmle', 'nrmp', 'medical student', 'physician'];
const RESEARCH = ['study', 'studies', 'trial', 'journal', 'research', 'researchers', 'findings', 'meta-analysis', 'cohort', 'randomi', 'doi'];
const NEWS = ['health', 'disease', 'outbreak', 'vaccine', 'hospital', 'patients', 'public health'];
const BURS = ['burs', 'scholarship', 'fellowship', 'grant', 'hibe', 'award'];
const EGITIM = ['kurs', 'eğitim', 'egitim', 'course', 'training', 'webinar', 'sertifika', 'certificate', 'workshop', 'summer school'];
const OFFICIAL_SUFFIX = /(\.gov|\.gov\.tr|\.edu|\.edu\.tr|\.int|europa\.eu|nih\.gov|\.gov\.uk|nhs\.uk|who\.int)$/;
const PROFESSIONAL = /(association|society|college|academy|federation|dernek|birli|kurumu|odası|odasi|council)/i;

function tierFor(url, hay) {
  const host = hostOf(url) || '';
  if (OFFICIAL_SUFFIX.test(host)) return { source_tier: 'OFFICIAL_PRIMARY', statement_treatment: 'official_guidance', evidence_role: 'PRIMARY_EVIDENCE' };
  if (PROFESSIONAL.test(hay)) return { source_tier: 'PROFESSIONAL_BODY', statement_treatment: 'professional_guidance', evidence_role: 'PRIMARY_EVIDENCE_FOR_OWN_STATEMENTS' };
  return { source_tier: 'SECONDARY_NEWSWIRE', statement_treatment: 'reported_news', evidence_role: 'DISCOVERY_ONLY' };
}

export function hekimlerHeading(hay) {
  const b = count(hay, BURS);
  const e = count(hay, EGITIM);
  if (b > e && b >= 2) return 'BURS';
  if (e > b && e >= 2) return 'EGITIM';
  return 'DUYURU';
}

const ROUTES_BY_HEADING = {
  BURS: ['OPPORTUNITY', 'NEEDS_REVIEW', 'DISCARD'],
  EGITIM: ['EDUCATION', 'NEEDS_REVIEW', 'DISCARD'],
  DUYURU: ['PROFESSIONAL_BRIEF', 'NEEDS_REVIEW', 'DISCARD'],
};

/**
 * @param {{ req, identity, endpoint, sample: {title?:string}[], pageTitle?: string, projections }} a
 */
export function resolveRouting({ req, identity, endpoint, sample = [], pageTitle = '', sameDomain = [] }) {
  if (identity?.match) {
    const m = identity.match;
    return { gate: 'PASS', lane: m.lane, channelId: LANES[m.lane].channelId, heading: m.heading, basis: 'EXISTING_IDENTITY' };
  }
  const url = endpoint?.page_url || endpoint?.url || req.url;
  const hay = [pageTitle, ...sample.map((s) => s.title || '')].join(' \n ').toLowerCase();
  const tier = tierFor(url, `${hay} ${hostOf(url)}`);
  const finish = (lane, basis, extra = {}) => {
    const heading = lane === 'hekimler' ? hekimlerHeading(hay) : lane === 'kaduse-news' ? 'HABER' : 'RESEARCH';
    return {
      gate: 'PASS',
      lane,
      channelId: LANES[lane].channelId,
      heading,
      ...(lane === 'hekimler' ? { allowed_routes: ROUTES_BY_HEADING[heading], default_route_on_accept: 'NEEDS_REVIEW' } : {}),
      ...tier,
      basis,
      ...extra,
    };
  };

  if (req.channel_hint) {
    const lane = CHANNEL_ALIASES[req.channel_hint];
    if (lane) return finish(lane, 'OPERATOR_HINT');
    if (req.channel_hint !== 'kaduse-medikal') return { gate: 'NEEDS_USER_DECISION', reason: 'UNKNOWN_CHANNEL', question: `Unknown channel "${req.channel_hint}". Use hekimler, kaduse-news or kaduse-research.` };
  }

  const holders = [...new Set(sameDomain.filter((s) => s.state !== 'RETIRED').map((s) => (s.store === 'hekimler' ? 'hekimler' : s.store)))];
  if (holders.length === 1 && !req.channel_hint) return finish(holders[0], 'SAME_DOMAIN_OWNER');

  const tr = (/\.tr$/.test(hostOf(url) || '') ? 3 : 0) + (/[ğüşıöç]/.test(hay) ? 2 : 0);
  const scores = {
    hekimler: tr + 2 * Math.min(3, count(hay, AUDIENCE)),
    'kaduse-research': tr ? 0 : 2 * Math.min(3, count(hay, RESEARCH)),
    'kaduse-news': tr ? 0 : Math.min(3, count(hay, NEWS)),
  };
  if (req.channel_hint === 'kaduse-medikal') scores.hekimler = -1;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [[top, s1], [second, s2]] = ranked;
  if (s1 >= 2 && s1 - s2 >= 2) return finish(top, 'CONTENT_SIGNALS', { scores });
  return {
    gate: 'NEEDS_USER_DECISION',
    reason: 'CHANNEL_AMBIGUOUS',
    scores,
    question: `Which channel should ${registrableDomain(url)} feed: ${top} or ${second}?`,
  };
}

/** Deterministic, collision-free source id in the lane's naming convention. */
export function proposeSourceId({ lane, heading, url, taken }) {
  const u = new URL(url);
  const label = (registrableDomain(url) || 'source').split('.')[0];
  const seg = u.pathname.split('/').filter(Boolean).find((s) => /^[a-z][a-z0-9-]{2,}$/i.test(s)) || '';
  const parts = [label, seg].filter(Boolean).map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, lane === 'hekimler' ? '_' : '-'));
  let base = lane === 'hekimler' ? parts.join('_') : parts.join('-');
  if (lane === 'hekimler' && heading === 'BURS') base = `burs_${base}`;
  if (lane === 'hekimler' && heading === 'EGITIM') base = `egitim_${base}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}${lane === 'hekimler' ? '_' : '-'}${i}`;
  return id;
}
