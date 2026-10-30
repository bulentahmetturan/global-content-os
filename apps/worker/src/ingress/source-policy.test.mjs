import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const S = await bundle('apps/worker/src/ingress/source-policy.ts', 'source-policy');
const G = await bundle('apps/worker/src/ingress/ingest-gate.ts', 'source-policy-gate');
const P = await bundle('apps/worker/src/triage/lane-purity.ts', 'source-policy-purity');
const R = 'news-reuters-healthcare-scoped';
const NOW = new Date('2026-10-29T12:00:00Z');

test('Reuters policy: drug approvals, trials and public health pass; business, US politics and the rest never enter', () => {
  const v = (t, o) => S.sourcePolicyVerdict(R, t, o);
  // Kept (owner 2026-10-29).
  assert.equal(v("Merck's eye disease drug meets main goal in mid-stage trial"), 'pass');
  assert.equal(v('US FDA approves Lilly breast cancer drug combination'), 'pass');
  assert.equal(v('Congo Ebola outbreak tops 8,000 cases, government says'), 'pass');
  assert.equal(v('Uganda to impose 21-day quarantine on returning citizens with Congo travel history'), 'pass');
  assert.equal(v('Kongo, Ebola salgınına sekizinci eyalete yayıldığını onayladı'), 'pass', 'a province is not US politics');
  assert.equal(v('ABD CDC, 2026\'da iki kızamık ölümünü doğruladı'), 'pass');
  // Business, finance, company.
  assert.equal(v('Merck strikes $2.13 billion deal for cancer drug'), 'deny');
  assert.equal(v("Viking Therapeutics' obesity drug shows long-term weight loss, shares rise"), 'deny');
  assert.equal(v('City Therapeutics files for US IPO'), 'deny');
  assert.equal(v('Nanjing Well Pharmaceutical Group Şirketi'), 'deny');
  assert.equal(v('Grail rallies as FDA staff flags no major concerns for multi-cancer test'), 'deny');
  assert.equal(v('Novo, Hengrui\'ye GLP-1 ilacı hakları için 2.6 milyar dolar ödeyecek'), 'deny');
  // US politics.
  assert.equal(v('Trump administration halts Obamacare enrollment for 760,000 people'), 'deny');
  assert.equal(v('In Iowa, soaring cancer rates emerge as a key midterms issue'), 'deny');
  assert.equal(v('ABD Demokrat Kadınlar sağlık bakanına estrojen eksikliğini sordu'), 'deny');
  // Everything else.
  assert.equal(v("Yemen's child hunger rising, UNICEF says"), 'deny');
  assert.equal(v('Anthropic and OpenEvidence partner on clinical AI'), 'deny');
  assert.equal(v('Pentagon to continue controversial testosterone testing'), 'deny');
  // Owner follow-up 2026-10-29: trial + share move is refused, a public figure's illness is refused, a "wow" lab story stays.
  assert.equal(v('Vaxcyte shares jump as pneumococcal vaccine meets main trial goals'), 'deny');
  assert.equal(v('Vaxcyte payı yükseldi: Pnömokok aşısı ana deney hedeflerini yerine getirdi'), 'deny');
  assert.equal(v("Pope Leo's cancer diagnosis clouds the shape of his papacy"), 'deny');
  assert.equal(v("Papa Leo'nun rahatsızlığı nedir?"), 'deny');
  assert.equal(v('Papanın şifalı yeri ne?'), 'deny');
  assert.equal(v('Life sciences firm Danaher to launch AI-powered autonomous research lab in 2027'), 'pass');
  assert.equal(v("Danaher, 2027'de AI destekli otomatik araştırma laboratuvarını açacak"), 'pass');
  // A source without a policy is untouched.
  assert.equal(S.sourcePolicyVerdict('news-who-newsroom-whole', 'Anything at all'), null);
});

test('ingest gate refuses what the source policy refuses, and only for that source', () => {
  const g = (feedId, title) => G.ingestGate({ route: 'kaduse-news', feedId, title, publishedAt: '2026-10-28' }, NOW);
  assert.deepEqual({ ...g(R, 'City Therapeutics files for US IPO') }, { ok: false, reason: 'source_policy' });
  assert.equal(g(R, 'US FDA approves Lilly breast cancer drug combination').ok, true);
  assert.equal(g('news-who-newsroom-whole', 'City Therapeutics files for US IPO').ok, true);
});

test('Medical News Today policy: our interest areas stay, a public figure\'s illness does not', () => {
  const v = (t) => S.sourcePolicyVerdict('news-medical-news-today-sitemap', t);
  // The owner's own examples (2026-10-29).
  assert.equal(v('How upping your daily step count may protect the aging brain'), 'pass');
  assert.equal(v('Prostate cancer risk may be detectable in blood 15 years before diagnosis'), 'pass');
  assert.equal(v('Social activities later in life could boost cognitive health, study finds'), 'pass');
  assert.equal(v('Ozempic plus hormone therapy may help boost weight loss at menopause'), 'pass');
  assert.equal(v('Over 500,000 deaths a year could be prevented by managing blood pressure'), 'pass');
  assert.equal(v('Major review links insomnia to increased risk of hospitalization and stroke'), 'pass');
  assert.equal(v('Pope Leo lung cancer diagnosis: What to know about lung adenocarcinoma'), 'deny');
  assert.equal(v('Celebrity skincare routines explained'), 'deny');
});

test('Medical Device Network policy: FDA/CE approvals in broad-impact areas only', () => {
  const v = (t) => S.sourcePolicyVerdict('news-medical-device-network-news-whole', t);
  // The owner's own examples (2026-10-30).
  assert.equal(v('Abbott secures CE Mark for Cologuard Plus cancer test'), 'pass');
  assert.equal(v('Happy Health’s ring secures FDA clearance for blood pressure measurement'), 'pass');
  // Approvals in narrow specialist areas.
  assert.equal(v('Edwards secures FDA approval for tricuspid valve repair system'), 'deny');
  assert.equal(v('FDA approves Stryker’s Sonopet 3 surgical platform'), 'deny');
  assert.equal(v('FDA greenlights Edwards’ expandable pulmonary valve for paediatric patients'), 'deny');
  // Not an FDA/CE approval.
  assert.equal(v('Koning Health secures Australian TGA approval for breast CT system'), 'deny');
  // New product / test, business, clinical data, safety.
  assert.equal(v('Roche’s TIB MOLBIOL introduces in vitro newborn screening test kit'), 'deny');
  assert.equal(v('GE HealthCare agrees to acquire SOFIE Biosciences in $945m deal'), 'deny');
  assert.equal(v('BD reports nine-month AGILITY trial data for Revello stent'), 'deny');
  assert.equal(v('Edwards’ SAPIEN M3 delivery system linked to patient death in FDA alert'), 'deny');
});

test('RAPS policy: AI / digital / software / robotic regulation and single-topic approvals only', () => {
  const v = (t) => S.sourcePolicyVerdict('news-raps-regulatory-focus-scoped', t);
  assert.equal(v('FDA draft guidance addresses considerations for robotically assisted surgical devices'), 'pass');
  assert.equal(v('FDA, MHRA officials eye streamlined frameworks for regulating genAI'), 'pass');
  assert.equal(v('FDA finalizes guidance on prescription drug apps'), 'pass');
  assert.equal(v('FDA approves first AI-enabled sepsis prediction tool'), 'pass');
  // Mixed roundups, even with an AI or approval lead story.
  assert.equal(v('Recon: FDA approves GSK hepatitis B drug; EQT to buy molecular testing firm Qiagen for $10.8B'), 'deny');
  assert.equal(v('Asia-Pacific Roundup: Japan’s PMDA shares principles for evaluating generative AI-enabled medical devices'), 'deny');
  assert.equal(v('This Week at FDA: Peptide dispute, clinical trial legislation, and more'), 'deny');
  // Warning letters, regulatory detail, US politics.
  assert.equal(v('FDA warns Baxter, Olympus for GMP and QSR violations'), 'deny');
  assert.equal(v('Biosimilars: FDA finalizes guidance on postapproval manufacturing changes'), 'deny');
  assert.equal(v('FDA issues draft guidance on individualized gene editing products'), 'deny');
  assert.equal(v('HHS launches ARPA-H project to speed clinical trials'), 'deny');
});

test('MedTech Dive policy: device approvals and striking device technology only', () => {
  const v = (t) => S.sourcePolicyVerdict('news-medtech-dive-news-whole', t);
  // Kept (owner 2026-10-29).
  assert.equal(v("Beta Bionics' insulin patch pump wins FDA clearance"), 'pass');
  assert.equal(v('Neptune Medical endoskopi robotu için FDA onayını aldı'), 'pass');
  assert.equal(v('Intuitive single-port robot gets CE mark for new indication'), 'pass');
  assert.equal(v('GE HealthCare to apply generative AI to radiation therapy workflows'), 'pass');
  // Business / finance / company.
  assert.equal(v('Oura seeks to raise funds in $2.2B IPO'), 'deny');
  assert.equal(v("GE HealthCare to buy Sofie Biosciences for $945M"), 'deny');
  assert.equal(v('Medikal teknoloji şirketleri telerobotik cerrahi için hazırlanıyor'), 'deny');
  assert.equal(v('Intuitive, kalp pazarına CE markı ile genişliyor'), 'deny');
  assert.equal(v("Cognita Imaging, FDA'dan tarama teknolojisini test etmek için sözleşme kazandı"), 'deny');
  // People moves.
  assert.equal(v("BD, Arthur Hu'yu bilgi ve dijital sorumlusu olarak görevlendirdi"), 'deny');
  assert.equal(v('Carlsmed names new chief financial officer'), 'deny');
  // US politics and reimbursement.
  assert.equal(v('CMS sets Medicare lab payment cuts'), 'deny');
  assert.equal(v("Dr. Oz says AI is raising health costs"), 'deny');
  // Recalls and safety.
  assert.equal(v("Edwards' Sapien mitral delivery system recall linked to 1 death"), 'deny');
  assert.equal(v('FDA issues import alert and warning letter to Olympus'), 'deny');
  // Clinical data.
  assert.equal(v('Dexcom study supports CGM use in non-insulin diabetes'), 'deny');
});

test('lane purity removes open Reuters items the policy refuses (inbox and hold) with a decision trail', async () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  sqlite.prepare(`INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled) VALUES (?, 'Reuters', 'kaduse-news', 'kaduse-medikal', 'WEB_ONLY', 'https://www.reuters.com/business/healthcare-pharmaceuticals/', 1440, 1)`).run(R);
  const add = (id, title, status) => sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, title_orig, summary, canonical_url, publisher, triage_status, dedupe_key, enrichment_status, published_at)
    VALUES (?, ?, 'kaduse-news', 'kaduse-medikal', ?, ?, 's', ?, 'Reuters', ?, ?, 'skipped', '2026-10-27')`).run(id, R, title, title, 'https://www.reuters.com/x/' + id, status, 'dk_' + id);
  add('ipo', 'City Therapeutics files for US IPO', 'inbox');
  add('pol', 'Trump administration halts Obamacare enrollment', 'hold');
  add('trial', "Merck's eye disease drug meets main goal in mid-stage trial", 'inbox');
  add('ebola', 'Congo Ebola outbreak tops 8,000 cases', 'hold');
  await P.enforceLanePurity({ DB: d1FromSqlite(sqlite) }, NOW);
  const st = (id) => sqlite.prepare('SELECT triage_status FROM source_items WHERE id = ?').get(id).triage_status;
  assert.deepEqual([st('ipo'), st('pol'), st('trial'), st('ebola')], ['trash', 'trash', 'inbox', 'hold']);
  const fb = sqlite.prepare("SELECT COUNT(*) n FROM review_feedback WHERE reviewer = 'system:lane-purity' AND feed_id = ? AND reason_code = 'not_relevant_for_channel'").get(R).n;
  assert.equal(fb, 2);
  const dec = sqlite.prepare("SELECT from_status FROM editorial_decisions WHERE source_item_id = 'pol'").get();
  assert.equal(dec.from_status, 'hold');
});

test('EMA policy: CHMP/PRAC outcomes, authorisation recommendations and vaccine guidance pass; veterinary, governance and admin notices never enter', () => {
  const v = (t) => S.sourcePolicyVerdict('news-ema-news-whole', t);
  // Kept (owner 2026-10-30), live titles as stored (machine-translated Turkish).
  assert.equal(v('AMA ve EMA Ebola aşı geliştirme için ortak rehber yayınladı'), 'pass');
  assert.equal(v('Yeni dudak GLP-1 ilacı tip 2 diyabet ve ağırlık yönetimi için'), 'pass');
  assert.equal(v('CHMP 12 Toplantılarından Özetler'), 'pass');
  assert.equal(v("EMA, metastatik pankreas kanserine yönelik Rasonque'nin ruhsatlandırılmasını önerdi"), 'pass');
  assert.equal(v('Pharmacovigilance Risk Assessment Komitesi (PRAC) toplantı başlıkları: 28 Eylül - 1 Ekim'), 'pass');
  // Original-language titles.
  assert.equal(v('Meeting highlights from the Committee for Medicinal Products for Human Use (CHMP) 12-15 October 2026'), 'pass');
  assert.equal(v('EMA recommends approval of new treatment for metastatic pancreatic cancer'), 'pass');
  // Veterinary.
  assert.equal(v('EMA, sığırlerdeki kabarcık cilt hastalığı için veteriner vaka tasdikini önerdi'), 'deny');
  assert.equal(v('Veteriner İlaç Maddeleri Komitesi (CVMP) 6 toplantısı sonuçları'), 'deny');
  assert.equal(v('Meeting highlights from the Committee for Veterinary Medicinal Products (CVMP)'), 'deny');
  // Governance, speeches, administrative notices, general policy.
  assert.equal(v('EMA İcra Kurulu: Eylül 2026 toplantısının çarpıcı noktaları'), 'deny');
  assert.equal(v('EMA İcra Direktörü Kadın Sağlığı Çok Taraflı Çalıştayında Konuşma'), 'deny');
  assert.equal(v('2026\'da Tip I Değişiklik Talepleri için Yıl Sonu Kabul Tarihi Bilgileri'), 'deny');
  assert.equal(v('Klinik deneme başvuruları danışmanlık pilotu kalıcı hale getirildi'), 'deny');
  assert.equal(v('Dünya çapındaki düzenleyiciler ilaç yaşam döngüsündeki hayvan deneylerine alternatiflerin geliştirilmesini istiyor'), 'deny');
  assert.equal(v('Kadınlar ilaç geliştirme sürecinden eksik kalmaktadır: EMA\'nın değişim haritası'), 'deny');
});
