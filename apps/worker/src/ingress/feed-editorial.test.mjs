import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { editorialRejection, applyEditorialFilter, parseArticleMeta, needsArticleMeta } = await import('./feed-editorial.ts');

const HT = 'news-www-haberturk-rss-whole';
const DW = 'news-www-dw-s-57554999-whole';
const rej = (feed, title, summary = '') => editorialRejection(feed, title, summary);

// Real headlines scanned 2026-11-03 (owner accept/reject decisions the same day).
describe('Habertürk Sağlık', () => {
  it('rejects ministers and President speeches', () => {
    assert.equal(rej(HT, "'Türkiye küresel şifa üssü oldu'", "Sağlık Bakanı Kemal Memişoğlu, 12. Türk Tıp Dünyası Kurultayı'nda Türkiye'nin sağlık alanındaki gelişmelerine dikkat çekerek"), 'political-speech');
    assert.equal(rej(HT, "Cumhurbaşkanı Erdoğan'dan önemli açıklamalar", 'Cumhurbaşkanı Recep Tayyip Erdoğan, 12. Türk Tıp Dünyası Kurultayı ve TÜSEB'), 'political-speech');
  });
  it('keeps a concrete regulation even when the minister is quoted', () => {
    assert.equal(
      rej(HT, '"Tıbbi müdahale süreçlerinde yepyeni bir süreç başlatıyoruz"', "Sağlık Bakanı Kemal Memişoğlu, Resmi Gazete'de yayımlanarak yürürlüğe giren Bilgilendirilmiş Rızanın Elektronik Ortamda Alınması Hakkında Yönetmelik"),
      null
    );
  });
  it('rejects single-person stories', () => {
    assert.equal(rej(HT, '13 yaşındaki kız hayatının şokunu yaşadı! Enfeksiyon denildi, 2 kez felç geçirdi', 'ABD ziyareti sırasında ... 13 yaşındaki'), 'single-person-story');
    assert.equal(rej(HT, "Psikolojisi bozuldu, 256 kiloya ulaştı", 'Üniversite yıllarında yaşadığı psikolojik sorunların ardından hızla kilo alan 30 yaşındaki Mansur Kaya'), 'single-person-story');
    assert.equal(rej(HT, "Doktorlar 'sabaha çıkmaz' demişti! Resimle hayata tutundu", 'Denizli\'de henüz 7,5 yaşındayken lösemi'), 'single-person-story');
    assert.equal(rej(HT, 'Babasından kök hücre nakli ile lösemiyi yendi', 'Ankara'), 'single-person-story-title');
    assert.equal(rej(HT, 'Su içerken bile zorlanan hasta 5,5 yıl sonra yeniden katı gıda yemeye başladı', 'Kahramanmaraşta nadir görülen akalazya hastalığı'), 'single-person-story-title');
  });
  it('rejects generic expert warnings', () => {
    assert.equal(rej(HT, 'Yorgunluk sanılan belirtiler gençlerde inmenin habercisi olabilir', 'Prof. Dr. Semih Giray, inmenin yalnızca ileri yaşlarda'), 'generic-expert-warning');
    assert.equal(rej(HT, 'Kalp hastalarına aşı uyarısı: Kışın risk artıyor', 'Kardiyoloji Uzmanı Prof. Dr. Barış Kılıç'), 'generic-expert-warning');
    assert.equal(rej(HT, 'Vakalar arttı: Ateş ve artan öksürüğe dikkat!', 'İç Hastalıkları Uzmanı Doç. Dr. Attila Önmez'), 'generic-expert-warning');
  });
  it('keeps misinformation corrections and public-health service news', () => {
    assert.equal(rej(HT, 'Demir eksikliği dış görünüşten anlaşılabilir mi?', "Sosyal medyada 'ferritin yüzü' adıyla yayılan paylaşımlar solgun cilt"), null);
    assert.equal(rej(HT, 'Bitkisel kürlerde mucize vaatlerine dikkat! ', 'Nefroloji Uzmanı Prof. Dr. Aydın Türkmen ile Diyetisyen'), null);
    assert.equal(rej(HT, 'Ergenlere ve gebelere yönelik sigara bırakma poliklinikleri yaygınlaştırılacak', 'Sağlık Bakanlığı, tütünle mücadele kapsamında'), null);
    assert.equal(rej(HT, 'TEİS açıkladı! Ülke genelinde ilaç tedariki sorunu', 'Tüm Eczacı İşverenleri Sendikası (TEİS) Genel Başkanı Nurten Saydan'), null);
    assert.equal(rej(HT, 'Kan şekerini dengeleyen 5 yardımcı meyve', 'Diyetisyenlere göre'), null);
  });
  it('keeps research and Turkish clinician achievements', () => {
    assert.equal(rej(HT, '150 yıl sonra tiroid bezinde yeni hücre keşfedildi', 'Endokrin Cerrahisi Uzmanı Prof. Dr. Erhan Ayhan ve araştırma grubu'), null);
    assert.equal(rej(HT, 'Türk spor cerrahı, dünyanın gözü önünde canlı cerrahiye imza attı', 'Prof. Dr. Gazi Huri'), null);
    assert.equal(rej(HT, "Araştırma: En büyük lif kaynağı çöp kutunuzda", 'Yetişkinlerin büyük bölümü yeterli miktarda lif tüketmiyor.'), null);
  });
  it('rejects child violence, digital age limit and generic climate; keeps Lancet', () => {
    assert.equal(rej(HT, 'Çocuklarda şiddet davranışı bir günde ortaya çıkmıyor!', 'uzmanlar'), 'child-violence-psychology');
    assert.equal(rej(HT, 'Çocukları dijital dünyadan korumak için yaş sınırı yeterli mi?', '15 yaş sınırı ve yaş doğrulama düzenlemesi'), 'digital-age-limit');
    assert.equal(rej(HT, 'İklim değişikliği sağlığımızı etkiliyor', 'yükselen sıcaklıklar ve şiddetli kuraklık'), 'generic-climate');
    assert.equal(rej(HT, 'İklim değişikliğinin sağlık üzerindeki etkileri hızlanıyor', 'COP31 öncesinde yayımlanan en son Lancet Countdown raporu'), null);
  });
  it('rejects a foreign company trial unless peer reviewed', () => {
    assert.equal(rej(HT, 'Kelliğe karşı hap geliştirildi', 'ABD merkezli ilaç şirketi Veradermics, hafif-orta derecede saç dökülmesi yaşayan 536 erkek üzerinde'), 'foreign-company-trial');
    assert.equal(rej(HT, 'Yeni hap', 'ABD merkezli ilaç şirketi ... sonuçlar Lancet dergisinde yayımlandı'), null);
  });
});

describe('DW Türkçe sağlık', () => {
  it('keeps general scientific and Turkish-origin science', () => {
    assert.equal(rej(DW, '50 yaş altındaki kanser vakaları neden artıyor?'), null);
    assert.equal(rej(DW, "Uğur Şahin ve Özlem Türeci'nin yeni şirketi: Arife"), null);
    assert.equal(rej(DW, 'Obsesif kompulsif bozukluk: Delirdiğinizi seyretmek gibi'), null);
  });
  it('rejects foreign local outbreaks', () => {
    assert.equal(rej(DW, "Frankfurt'ta ölüm: Havalimanı sıtması nedir?"), 'foreign-local-outbreak');
    assert.equal(rej(DW, "Sibirya'daki ölüm sonrası veba şüphesi: DSÖ ve ABD devrede"), 'foreign-local-outbreak');
  });
  it('rejects a foreign country rule', () => {
    assert.equal(rej(DW, 'Okullarda kızartmaya son: Bu yasak neden iyi fikir?'), 'foreign-country-rule');
    assert.equal(rej(DW, 'Okullarda kızartmaya son: Bu yasak neden iyi fikir?', 'Türkiye için de bir örnek olabilir mi'), 'foreign-country-rule');
    assert.equal(rej(DW, 'Gürcistan küresel taşıyıcı annelik üssüne nasıl dönüştü?'), 'foreign-country-rule');
  });
  it('keeps contested Türkiye policy only with a clinical angle', () => {
    assert.equal(rej(DW, "Türkiye'de kürtaja erişim: Yasal hak neden tartışılıyor?"), 'contested-policy-no-clinic');
    assert.equal(rej(DW, "Türkiye'de kürtaja erişim: Yasal hak neden tartışılıyor?", 'Hekimler tıbbi prosedürün güvenliği'), null);
  });
});

describe('plumbing', () => {
  it('leaves other feeds untouched', () => {
    const items = [{ title: 'Cumhurbaşkanı Erdoğan açıkladı', summary: '' }];
    const r = applyEditorialFilter('some-other-feed', items);
    assert.equal(r.kept, items);
    assert.deepEqual(r.dropped, []);
  });
  it('reports dropped items with the rule id', () => {
    const r = applyEditorialFilter(DW, [{ title: 'Frankfurt veba', summary: '' }, { title: '50 yaş altındaki kanser vakaları neden artıyor?', summary: '' }]);
    assert.equal(r.kept.length, 1);
    assert.deepEqual(r.dropped, [{ title: 'Frankfurt veba', rule: 'foreign-local-outbreak' }]);
  });
  it('reads article date and description, never inventing a date', () => {
    const html = '<meta property="og:description" content="Kanser &amp; yaş"/><script>{"datePublished":"2026-10-17T06:12:42.549Z","dateModified":"x"}</script>';
    assert.deepEqual(parseArticleMeta(html), { publishedAt: '2026-10-17T06:12:42.549Z', description: 'Kanser & yaş' });
    assert.deepEqual(parseArticleMeta('<html></html>'), { publishedAt: null, description: null });
    assert.equal(needsArticleMeta(DW), true);
    assert.equal(needsArticleMeta(HT), false);
  });
});
