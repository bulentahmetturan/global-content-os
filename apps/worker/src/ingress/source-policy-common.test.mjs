import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const S = await bundle('apps/worker/src/ingress/source-policy.ts', 'source-policy-common');
const v = (feed, t, orig) => S.sourcePolicyVerdict(feed, t, orig);

const POLICY_FEEDS = [
  'news-reuters-healthcare-scoped',
  'news-medtech-dive-news-whole',
  'news-raps-regulatory-focus-scoped',
  'news-who-newsroom-whole',
  'news-medical-news-today-sitemap',
  'news-medical-device-network-news-whole',
  'news-ema-news-whole',
  'news-healthai-news-whole',
  'news-medpagetoday-sitemap',
  'news-nice-healthtech-scoped',
  'news-ec-medical-devices-target',
  'news-fda-press-scoped',
  'news-imdrf-news-whole',
  'news-ashp-safemedication-sitemap',
];

test('common narrow filter refuses the owner reject list on every policy source, even when the source allow list matches', () => {
  const refused = [
    'Company raises $200 million to expand vaccine guidance work', // company and finance
    'Junior doctors strike over pay and rota changes in vaccine guidance row', // foreign workforce conditions
    'Insurers change reimbursement coverage for new vaccine guidance', // foreign local system
    'Senate hearing on FDA approval of vaccine guidance', // general politics
    'Dr Smith appointed chair of vaccine guidance group', // appointments
    'Webinar on new guidance for AI vaccine approvals', // event announcements
    'Agency signs memorandum of understanding on vaccine guidance', // MoU
    'Minister visit and award ceremony for vaccine guidance team', // corporate promotion
    'Discounts on sponsored vaccine guidance books', // ads
    'Ten best skincare ways to keep a healthy heart', // lifestyle list
    'FDA approves new device; company raises funds; Senate votes on vaccine guidance', // roundup
    'Newsletters', // site noise
  ];
  for (const feed of POLICY_FEEDS) for (const t of refused) assert.equal(v(feed, t), 'deny', `${feed}: ${t}`);
});

test('common narrow filter admits the owner pass areas when the source allow list also matches', () => {
  assert.equal(v('news-reuters-healthcare-scoped', 'Pennsylvania measles cases top 700 after four outbreak-related deaths reported'), 'pass');
  assert.equal(v('news-who-newsroom-whole', 'New global roadmap launched to tackle hypertension in pregnancy'), 'pass');
  assert.equal(v('news-medtech-dive-news-whole', 'Beta Bionics’ insulin patch pump gets FDA nod'), 'pass');
  assert.equal(v('news-ema-news-whole', 'Meeting highlights from the Committee for Medicinal Products for Human Use (CHMP) 12-15 October 2026'), 'pass');
  assert.equal(v('news-raps-regulatory-focus-scoped', 'FDA, MHRA officials eye streamlined frameworks for regulating genAI'), 'pass');
  // No admitted area at all.
  assert.equal(v('news-reuters-healthcare-scoped', 'Nobel chemistry prize goes to pair who solved mystery of mirror image molecules'), 'deny');
});

test('IMDRF and ASHP SafeMedication have a policy; Turkish official sources stay untouched', () => {
  assert.equal(v('news-imdrf-news-whole', 'IMDRF publishes final guidance on cybersecurity for medical device software'), 'pass');
  assert.equal(v('news-imdrf-news-whole', 'IMDRF Management Committee meeting in Tokyo'), 'deny');
  assert.equal(v('news-ashp-safemedication-sitemap', 'What patients need to know about retatrutide side effects'), 'pass');
  assert.equal(v('news-ashp-safemedication-sitemap', 'Ten healthy dinner recipes for the week'), 'deny');
  for (const feed of ['news-aa-saglik-scoped', 'news-titck-tibbi-cihaz-duyurulari', 'news-saglik-bakanligi-whole', 'news-sgk-health-scoped']) {
    assert.equal(v(feed, 'Webinar on company shares; senate vote'), null, feed);
  }
});
