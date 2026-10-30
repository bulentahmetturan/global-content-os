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
  'news-ep-sant-scoped',
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
  assert.equal(v('news-reuters-healthcare-scoped', 'Pennsylvania measles cases top 700 after four outbreak-related deaths reported'), 'deny'); // one foreign state's outbreak: neither relevant to Turkish professionals nor wow
  assert.equal(v('news-reuters-healthcare-scoped', "Congo's Ebola outbreak has killed more than 4,000, government data shows"), 'pass'); // world-scale
  assert.equal(v('news-reuters-healthcare-scoped', 'Kenya reports second death from Ebola'), 'deny');
  assert.equal(v('news-medpagetoday-sitemap', 'More Medical Debt Linked to More Deadly Cancers'), 'deny');
  assert.equal(v('news-medical-news-today-sitemap', 'What the latest research says about how diet can support your liver health'), 'pass'); // serves the health-following public
  assert.equal(v('news-medical-news-today-sitemap', 'How your daily drink choice may be affecting your mental health'), 'pass');
  assert.equal(v('news-medpagetoday-sitemap', 'Nobel Medicine Prize Goes to 3 Scientists for Research Into Brain Activity'), 'pass');
  assert.equal(v('news-reuters-healthcare-scoped', 'Teva wins FDA approval for monthly schizophrenia injection Weltruza'), 'pass');
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
  assert.equal(v('news-ashp-safemedication-sitemap', 'ASHP Urges FDA to Enforce Requirements for Peptide Compounding'), 'pass');
  assert.equal(v('news-ashp-safemedication-sitemap', 'Student Pharmacists Reflect on the Power of Their Voice During ASHP Policy Week'), 'deny');
  assert.equal(v('news-ep-sant-scoped', '24 October: World Polio Day'), 'deny');
  assert.equal(v('news-ep-sant-scoped', 'Presentation of a study on The Use of Data in Public Health'), 'pass');
  assert.equal(v('news-ashp-safemedication-sitemap', 'Ten healthy dinner recipes for the week'), 'deny');
  for (const feed of ['news-titck-tibbi-cihaz-duyurulari', 'news-saglik-bakanligi-whole']) {
    assert.equal(v(feed, 'Webinar on company shares; senate vote'), null, feed);
  }
});

test('Bilim Genç keeps health explainers and refuses chess, puzzles, sky guides and summit pages', () => {
  const f = 'news-bilimgenc-tubitak-saglik-whole';
  assert.equal(v(f, 'Dişin İçindeki Kök Hücreler Sinir Onarımına Yardımcı Olabilir mi?'), 'pass');
  assert.equal(v(f, 'Kahve Neden Hepimizi Aynı Şekilde Etkilemiyor?'), 'pass');
  assert.equal(v(f, 'Satranç Ekim 2026 Alıştırma Sorusunun Cevabı'), 'deny');
  assert.equal(v(f, 'Zirve taahütname'), 'deny');
  assert.equal(v(f, 'Ekim 2026’da Gökyüzü'), 'deny');
});
