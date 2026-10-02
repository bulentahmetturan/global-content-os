// Localization V2: terminology guard, source-type policy, evidence acquisition / extraction, title preparation. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = async (entry, name) => {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};
const term = await bundle('apps/worker/src/localize/terminology.ts', 'v2-term');
const st = await bundle('apps/worker/src/localize/source-type.ts', 'v2-st');
const acq = await bundle('apps/worker/src/localize/acquire.ts', 'v2-acq');
const ev = await bundle('apps/worker/src/localize/evidence.ts', 'v2-ev');
const pol = await bundle('apps/worker/src/localize/summary-policy.ts', 'v2-pol');
const ttl = await bundle('apps/worker/src/localize/title.ts', 'v2-title');
const surf = await bundle('apps/worker/src/localize/surface.ts', 'v2-surface');

// ---- token-level foreign-word leak (observed in the local-first batch and V1 canaries) ------------------------------
test('leak: ordinary English words copied into Turkish output are caught, even inside a capitalised run', () => {
  const t = 'New | phs004026.v1.p1 | SCORCH: Revealing the Single Cell Determinants of Brain Relevant to Persistent HIV Infection and Opioid Use Disorder';
  assert.deepEqual(surf.sourceCopyLeaks('Yeni | phs004026.v1.p1 | SCORCH: Persistent HIV Enfeksiyonu ve Opioid Kullanım Bozukluğu ile İlgili Tek Hücre Belirleyicileri', t), ['persistent']);
  const src = 'CDC and CSTE work on a definition for measles deaths. Measles cases rose this year.';
  assert.deepEqual(surf.sourceCopyLeaks('CDC ve CSTE, measles ölümüne ilişkin bir tanım geliştiriyor.', src, src), ['measles']);
  assert.ok(surf.surfaceIssues('Cordis, sirolimus-eluting balon için FDA onayını kazandı', 'Cordis wins FDA nod for sirolimus-eluting balloon').includes('ENGLISH_COPY:eluting'));
  assert.ok(surf.surfaceIssues("Araştırmacılar yeni bir AI framework'ü geliştirdi.", 'Researchers built an AI framework for breast ultrasound.', 'Researchers built an AI framework for breast ultrasound.').includes('ENGLISH_COPY:framework'));
  assert.ok(surf.sourceCopyLeaks('Ultrasound ve Dijital Meme Tomosentezini Birleştiren AI Modeli', 'AI Model Combining Ultrasound and Digital Breast Tomosynthesis Improves Specificity', 'An AI model combining breast ultrasound and tomosynthesis.').includes('ultrasound'));
});

test('leak: names, acronyms, codes, drug names, species epithets and shared words are not leaks', () => {
  const src = 'FDA clears Myrava’s patient-specific bolus device for statin users';
  assert.deepEqual(surf.sourceCopyLeaks("FDA, Myrava'nın hastaya özel bolus cihazını statin kullananlar için onayladı", src), []);
  assert.deepEqual(surf.sourceCopyLeaks('Tekrarlayan C. difficile enfeksiyonu olan hastalarda FMT', 'FMT-Associated Changes in Patients With Recurrent C. difficile Infection'), []);
  const ev = 'Health Canada updated its guidance on summary reports for natural health products.';
  assert.deepEqual(surf.sourceCopyLeaks('Health Canada, doğal sağlık ürünleri için rehberini güncelledi.', `Summary reports guidance ${ev}`, ev), []);
  assert.deepEqual(surf.sourceCopyLeaks('Sirolimus kaplı balon ve paclitaxel kaplı cihaz', 'Sirolimus balloon versus paclitaxel-coated device', 'The sirolimus balloon competes with a paclitaxel-coated device.'), []);
  assert.deepEqual(surf.sourceCopyLeaks('FDA Danışmanları Galleri Testini Önerdi', 'FDA Advisors Recommend Galleri Multi-Cancer Test'), []);
});

// ---- malformed / garbled Turkish ------------------------------------------------------------------------------------
test('malformed: clear generation corruption is caught (konsjenital, etklerinden, vowel-less, hybrids)', () => {
  assert.deepEqual(surf.malformedTokens('Düşük Oranlı Konsjenital TORCH Enfeksiyonları', 'Low-rate congenital TORCH infections'), ['konsjenital']);
  assert.deepEqual(surf.malformedTokens('Aşırı sıcağın sağlık etklerinden korunun.'), ['etklerinden']);
  assert.deepEqual(surf.malformedTokens('Bu çalışma krtsl bulgular verdi.'), ['krtsl']);
  assert.ok(surf.surfaceIssues('Cordis, sirolimus-elüyerek balon için onay aldı.', 'Cordis wins FDA nod for sirolimus-eluting balloon').some((i) => i.startsWith('HYBRID:sirolimus-')));
  assert.ok(surf.surfaceIssues('Ultra-ispiyonlu gıdalar riski artırıyor.', 'Ultra-processed food raises disease risk', 'Each extra 100 grams of ultra-processed food raises risk.').some((i) => i.startsWith('HYBRID:ultra-')));
});

test('malformed: valid Turkish and medical loanwords are not flagged', () => {
  const ok = [
    "Türkçe kontrol elektrik enstitü transplantasyon sendrom kompleks ambulans pankreas ateroskleroz obstetrik ultrasonografi",
    "yurtdışında üstlendi gençlerin çiftlik aşktan halktan renkli farklı kentsel anksiyete ekstrakorporeal spektrometri",
    "şüphe ishal ithal hızsız adjuvan ebeveynlerin rezervler şarj teyp kalp film test Türk zevk metabolizm psikiyatri pnömoni",
    "Üniversitesi'nden İngiltere'de Schmidt ve Wegovy hakkında anti-inflamatuvar Covid-19 sağlıklı değerlendirme",
  ];
  for (const s of ok) assert.deepEqual(surf.malformedTokens(s), [], s);
});

// ---- terminology guard --------------------------------------------------------------------------------------------
test('terminology: observed V1 errors are unsupported substitutions (tomosynthesis -> tomografi, measles -> çiçek hastalığı)', () => {
  const a = term.checkTerminology('Digital breast tomosynthesis improves cancer detection', 'Dijital meme tomografisi kanser tespitini iyileştiriyor', 'title');
  assert.equal(a.verdict, 'unsupported_substitution');
  assert.ok(a.issues.includes('ENTITY_SUBSTITUTION:tomosynthesis->tomography'), a.issues.join());
  const b = term.checkTerminology('CDC works on definition for measles deaths', 'CDC çiçek hastalığı ölümleri için tanım üzerinde çalışıyor', 'title');
  assert.ok(b.issues.includes('ENTITY_SUBSTITUTION:measles->smallpox'), b.issues.join());
  const c = term.checkTerminology('Digital breast tomosynthesis improves cancer detection', 'Dijital meme tomosentezi kanser tespitini iyileştiriyor', 'title');
  assert.equal(c.verdict, 'same', c.issues.join());
});

test('terminology: summary mode catches substitution and introduced entities but allows omission', () => {
  const src = 'Measles cases rise in Texas. Health officials urged vaccination as measles outbreaks spread.';
  assert.equal(term.checkTerminology(src, 'Teksas’ta kızamık vakaları artıyor; yetkililer aşı çağrısı yaptı.', 'summary').verdict, 'same');
  assert.equal(term.checkTerminology(src, 'Teksas’ta vakalar artıyor.', 'summary').verdict, 'same'); // omission is not substitution
  assert.ok(term.checkTerminology(src, 'Teksas’ta su çiçeği vakaları artıyor.', 'summary').issues.some((i) => i.startsWith('ENTITY_SUBSTITUTION:measles->')));
  assert.ok(term.checkTerminology('Heat guidance for older adults was published.', 'Yaşlılar için sıtma rehberi yayımlandı.', 'summary').issues.includes('ENTITY_INTRODUCED:malaria'));
});

test('terminology: Turkish word boundaries ("aşırı" is not "aşı"), narrower-safe renderings and acronym equivalents', () => {
  assert.equal(term.checkTerminology('Extreme heat events and health', 'Aşırı sıcak olayları ve sağlık', 'title').verdict, 'same');
  const us = term.checkTerminology('Ultrasound screening for liver disease', 'Karaciğer hastalığı için ultrasonografi taraması', 'title');
  assert.notEqual(us.verdict, 'unsupported_substitution', us.issues.join());
  assert.deepEqual(ev.preservationIssues('CT scans and MRI in the ICU', 'Yoğun bakımda BT taramaları ve MR'), []);
  assert.ok(ev.preservationIssues('CT scans and MRI', 'Taramalar').some((i) => i.startsWith('ENTITY_MISSING')));
});

test('terminology: drug names must survive the title (transliteration allowed), a missing drug fails', () => {
  assert.deepEqual(term.drugNames('Semaglutide and tirzepatide vs placebo'), ['semaglutide', 'tirzepatide']);
  assert.equal(term.checkTerminology('FDA weighs semaglutide label change', 'FDA semaglutid etiket değişikliğini değerlendiriyor', 'title').verdict, 'same');
  assert.ok(term.checkTerminology('FDA weighs semaglutide label change', 'FDA kilo ilacı etiket değişikliğini değerlendiriyor', 'title').issues.includes('DRUG_MISSING:semaglutide'));
  assert.equal(term.checkTerminology('Penicillin allergy delabeling', 'Penisilin alerjisi etiketinin kaldırılması', 'title').issues.filter((i) => i.startsWith('DRUG')).length, 0);
});

test('terminology: glossary hints name the required renderings for the translator', () => {
  const hints = term.glossaryHints('Measles and CT imaging in the US');
  assert.ok(hints.some((h) => /^measles = kızamık/.test(h)), hints.join(' | '));
  assert.ok(hints.some((h) => h.startsWith('CT = CT or BT')));
});

// ---- source type + policy -----------------------------------------------------------------------------------------
test('source type: research / consumer health / regulation / news are classified from feed, host and title shape', () => {
  assert.equal(st.classifySourceType({ title: 'New | phs004026.v1.p1 | Genomic study', feed: 'dbgap', url: 'https://www.ncbi.nlm.nih.gov/projects/gap' }), 'research');
  assert.equal(st.classifySourceType({ title: 'Association of statin use with dementia', url: 'https://jamanetwork.com/journals/x' }), 'research');
  assert.equal(st.classifySourceType({ title: 'Extreme heat events: How to protect yourself', url: 'https://www.canada.ca/en/health-canada/x.html' }), 'consumer_health');
  assert.equal(st.classifySourceType({ title: 'Commission adopts implementing regulation on medical devices', url: 'https://health.ec.europa.eu/x' }), 'regulation');
  assert.equal(st.classifySourceType({ title: 'Hospital layoffs continue', url: 'https://www.fiercehealthcare.com/x' }), 'news');
  for (const t of st.SOURCE_TYPES) {
    const p = pol.summaryPolicy(t);
    assert.ok(p.focus && p.judge, `policy for ${t}`);
  }
  assert.notEqual(pol.summaryPolicy('research').judge, pol.summaryPolicy('news').judge); // not one universal prompt
});

// ---- acquisition ----------------------------------------------------------------------------------------------------
test('acquire: aggregator links resolve (bing) or are refused (google news); DOI is extracted', () => {
  assert.equal(acq.resolveUrl('https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.org%2Fa&c=1'), 'https://example.org/a');
  assert.equal(acq.resolveUrl('https://news.google.com/rss/articles/CBMi'), null);
  assert.equal(acq.doiOf('https://doi.org/10.1056/NEJMoa2400001.'), '10.1056/NEJMoa2400001');
});

test('acquire: article paragraphs are extracted, glued block text is re-spaced, page chrome is ignored', () => {
  const html = `<html><head><meta name="description" content="Short description of the study."></head><body><nav><p>Subscribe to our newsletter for the latest updates every single day now</p></nav>
    <article><p>Researchers followed 4,000 adults with type 2 diabetes for five years in a national cohort study.</p><p>Those who took the drug had fewer hospital admissions for heart failure than those on placebo.That finding held across age groups and sexes in the trial.</p></article></body></html>`;
  const sources = acq.sourcesFromHtml(html, 'https://example.org/a');
  const article = sources.find((s) => s.kind === 'article');
  assert.ok(article, JSON.stringify(sources));
  assert.match(article.text, /placebo\. That finding/);
  assert.equal(acq.rankSources(sources)[0].kind, 'article');
});

test('acquire: network is bounded; no URL or no fetch means the feed excerpt only', async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return new Response('<article><p>' + 'Word '.repeat(12) + 'one.</p></article>', { status: 200, headers: { 'content-type': 'text/html' } }); };
  const none = await acq.acquireEvidence({ title: 'x', excerpt: 'Feed excerpt text here.' }, fakeFetch);
  assert.equal(calls, 0);
  assert.deepEqual(none.map((s) => s.kind), ['publisher_excerpt']);
  await acq.acquireEvidence({ title: 'x', excerpt: '', url: 'https://example.org/a' }, fakeFetch);
  assert.ok(calls >= 1 && calls <= 2);
  const offline = await acq.acquireEvidence({ title: 'x', excerpt: 'Feed excerpt.', url: 'https://example.org/a' }, null);
  assert.deepEqual(offline.map((s) => s.kind), ['publisher_excerpt']);
});

// ---- extraction -----------------------------------------------------------------------------------------------------
const T = 'Measles vaccination rates fall in US kindergartens';
const ARTICLE = [
  'Measles vaccination coverage among US kindergartners dropped to 92.5% in the last school year, according to the CDC.',
  'Exemptions from school vaccine requirements reached a record high in 2024 across most states.',
  'Health officials said lower coverage raises the risk of measles outbreaks in local communities.',
  'The agency urged parents to keep children up to date with routine vaccinations before school starts.',
  'Several states reported coverage below the 95% target that is needed to stop measles spreading.',
  'Officials plan additional outreach in districts with the lowest rates this autumn.',
].join(' ');

test('evidence: 2-5 verbatim spans from the highest-priority adequate source, never mixed', () => {
  const r = ev.assessEvidenceSources(T, [
    { kind: 'article', text: ARTICLE, origin: 'https://example.org/a' },
    { kind: 'publisher_excerpt', text: 'Coverage fell again this year, officials said in a statement released on Monday morning.', origin: 'feed' },
  ]);
  assert.equal(r.sufficient, true);
  assert.equal(r.kind, 'article');
  assert.ok(r.passages.length >= ev.EVIDENCE_MIN_SPANS && r.passages.length <= ev.EVIDENCE_MAX_SPANS);
  for (const p of r.passages) assert.ok(ARTICLE.includes(p), 'span is verbatim from the chosen source');
});

test('evidence: one sentence is too short; off-topic page text is OFF_TOPIC; a lower-priority adequate source is used', () => {
  assert.equal(ev.assessEvidence(T, 'Measles vaccination coverage among US kindergartners dropped to 92.5% last year, the CDC said today.').reason, 'TOO_SHORT');
  const offTopic = 'The hospital announced a new parking structure for staff and visitors this spring. Construction is expected to take eighteen months and cost several million dollars overall.';
  assert.equal(ev.assessEvidence(T, offTopic).reason, 'OFF_TOPIC');
  const r = ev.assessEvidenceSources(T, [{ kind: 'article', text: offTopic, origin: 'a' }, { kind: 'abstract', text: ARTICLE, origin: 'b' }]);
  assert.equal(r.kind, 'abstract');
});

test('evidence: bylines and subscription chrome are boilerplate, not evidence; "By 2030" sentences are kept', () => {
  const r = ev.assessEvidence('Obesity forecast for 2030', 'By Jane Smith. Subscribe to unlock this article. By 2030, obesity prevalence is forecast to exceed 30% in many countries. The obesity forecast models used national survey data from 2000 to 2024.');
  assert.equal(r.sufficient, true);
  assert.ok(!r.passages.some((p) => /Jane Smith|Subscribe/.test(p)));
  assert.ok(r.passages.some((p) => p.startsWith('By 2030')));
});

// ---- title preparation ----------------------------------------------------------------------------------------------
test('title preparation: entities decoded, dbGaP prefix normalised, expansion detected', () => {
  assert.equal(ttl.prepareTitle('Van&#x27;s heart centre').core, "Van's heart centre");
  assert.match(ttl.prepareTitle('New | phs004026.v1.p1 | Genomic study').prefix || '', /^Yeni \| phs004026\.v1\.p1 \| $/);
  assert.ok(ttl.expansionIssues('Statins and dementia', 'Statinler ve demans (yaşlı yetişkinlerde yapılan geniş kapsamlı bir çalışmaya göre)').length > 0);
  assert.deepEqual(ttl.expansionIssues('Statins and dementia', 'Statinler ve demans'), []);
});
