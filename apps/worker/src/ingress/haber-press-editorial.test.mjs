import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { editorialRejection } = await import('./feed-editorial.ts');
const { applyFeedUrlScope } = await import('./feed-scope.ts');

// Owner PASS/FAIL interviews 2026-11-03 (Bible 26.1, list D): real headlines read from the live pages the same day.
// KABUL = inside the outlet's health section (feed-scope.ts) and not rejected by feed-editorial.ts.
function passes(feedId, title, url) {
  if (applyFeedUrlScope(feedId, [{ title, url }]).length !== 1) return false;
  return editorialRejection(feedId, title, '') === null;
}

const U = {
  trt: (s) => `https://www.trthaber.com/haber/saglik/${s}-961000.html`,
  sabah: (s) => `https://www.sabah.com.tr/saglik/2026/11/02/${s}`,
  cnn: (s) => `https://www.cnnturk.com/saglik/${s}-3487000`,
  oks: (s) => `https://gazeteoksijen.com/saglik/${s}-294000`,
  euro: (s) => `https://tr.euronews.com/2026/11/02/${s}`,
  medi: (s) => `https://www.medimagazin.com.tr/guncel/${s}-121000`,
  aa: (s) => `https://www.aa.com.tr/tr/saglik/${s}/1`,
};

const CASES = [
  // [feed id, title, url, expected]
  ['news-trthaber-haber-whole', "Bakan Memişoğlu: Robotik cerrahi cihazı Türkiye'de üretilecek", U.trt('robotik'), true],
  ['news-trthaber-haber-whole', 'Bakan Memişoğlu: Yerli ultrason cihazı üretim tesisimizi kuruyoruz', U.trt('ultrason'), true],
  ['news-trthaber-haber-whole', 'Tıbbi müdahaleler için elektronik rıza dönemi başladı', U.trt('riza'), true],
  ['news-trthaber-haber-whole', 'Bakan Memişoğlu: Her yıl 7 milyonun üzerinde vatandaşımıza şifa kapısı oluyoruz', U.trt('sifa'), false],
  ['news-trthaber-haber-whole', '117 kalp merkeziyle ileri tanı ve tedavi hizmeti sunuluyor', U.trt('kalp'), false],
  ['news-trthaber-haber-whole', '2 ilaç daha geri ödeme kapsamına alındı', U.trt('geri-odeme'), false],
  ['news-trthaber-haber-whole', 'Dokuz ayda 4 milyonun üzerinde yaşlıya sağlık değerlendirmesi yapıldı', U.trt('yasli'), false],
  ['news-trthaber-haber-whole', 'Bakan açıklaması', 'https://www.trthaber.com/haber/gundem/bakan-961999.html', false],

  ['news-sabah-haber-whole', 'Bir tıp kanla 15 kanser riski belirlenecek', U.sabah('kan'), true],
  ['news-sabah-haber-whole', 'Kanser aşısından gen tedavilerine sağlıkta büyük hamle', U.sabah('gen'), false],
  ['news-sabah-haber-whole', 'Dünyada 156 milyon genç akran şiddetine maruz kalıyor', U.sabah('akran'), false],

  ['news-cnnturk-haber-whole', 'Osteoporozun asıl riski günlük yaşamı etkileyen kırıklar', U.cnn('galeri/osteoporoz'), true],
  ['news-cnnturk-haber-whole', 'Çocuklarda kasık fıtığına dikkat: "Bebeklerde ölümcül olabilir"', U.cnn('cocuklarda-kasik-fitigi'), true],
  ['news-cnnturk-haber-whole', "Cumhurbaşkanı Erdoğan'dan Serpil Bahçeli için taziye mesajı", 'https://www.cnnturk.com/turkiye/taziye-3487992', false],
  ['news-cnnturk-haber-whole', 'Ukrayna ile Rusya arasında enerji savaşı', 'https://www.cnnturk.com/video/dunya/enerji-3487990', false],

  ['news-gazeteoksijen-haber-whole', 'Yere düşen yiyecekte 5 saniye kuralı çöktü', U.oks('5-saniye'), true],
  ['news-gazeteoksijen-haber-whole', 'Haftalık longevity egzersiz programı', 'https://gazeteoksijen.com/yazarlar/prof-dr-osman-muftuoglu/longevity-294269', false],
  ['news-gazeteoksijen-haber-whole', "Sarıgül ailesine yönelik 'kara para' soruşturması", 'https://gazeteoksijen.com/turkiye/sarigul-294725', false],

  ['news-euronews-tr-haber-whole', "Afrika'da rekor hızla büyüyen Ebola salgınında 5.376 kişi öldü", U.euro('ebola'), true],
  ['news-euronews-tr-haber-whole', "DSÖ: 'Pandemi anlaşmasının acilen tamamlanması gerekiyor'", U.euro('dso-pandemi'), true],
  ['news-euronews-tr-haber-whole', "AB hastalık merkezi Nijerya'ya uzman yolluyor, Kongo'da Ebola 10 bini aşıyor", U.euro('nijerya'), true],
  ['news-euronews-tr-haber-whole', "Fransa, AB'de 7 milyon prezervatifi enfeksiyon riskiyle geri çağırdı", U.euro('prezervatif'), false],
  ["news-euronews-tr-haber-whole", "Almanya'da grip aşısı alarmı: Yaşlılarda aşılama oranı düşüyor", U.euro('grip'), false],
  ['news-euronews-tr-haber-whole', 'Kellik hapında umut verici sonuçlar: Altı ayda saç sayısını artırdı', U.euro('kellik'), false],
  ['news-euronews-tr-haber-whole', "Elon Musk'ın beyin çipi firması Neuralink insan beynini Grok'a bağladı", U.euro('neuralink'), false],
  ['news-euronews-tr-haber-whole', 'EU.XL Euronews ile manşetlerin ötesine geçin', 'https://tr.euronews.com/programs/eu-xl', false],

  ['news-medimagazin-haber-whole', 'Yaklaşık bir milyon hasta incelendi: Kadın hekimlerin takip ettiği hastalarda ölüm oranı daha düşük', U.medi('kadin-hekim'), true],
  ['news-medimagazin-haber-whole', 'GLP-1 ilaçları prediyabette diyabet ve kalp-damar risklerinin azalmasıyla ilişkilendirildi', U.medi('glp'), true],
  ['news-medimagazin-haber-whole', '131. Dönem DHY kurası sonuçları açıklandı: Yerleşen hekimlerin listesi yayımlandı', U.medi('dhy'), true],
  ['news-medimagazin-haber-whole', "ASELSAN'a kalp akciğer makinesi ile Aziz Sancar Ödülü", U.medi('aselsan'), true],
  ['news-medimagazin-haber-whole', 'TEB\'ten "Eczacıya meslek hakkı ödenmeli" çağrısı', U.medi('eczaci'), true],
  ['news-medimagazin-haber-whole', 'Sağlık Bakanı Memişoğlu, KKTC Sağlık Bakanı Dinçyürek ile görüştü', U.medi('kktc'), false],
  ['news-medimagazin-haber-whole', 'Türkiye ile Kuzey Makedonya arasında sağlık alanında mutabakat zaptı imzalandı', U.medi('makedonya'), false],
  ['news-medimagazin-haber-whole', 'Sağlık Bakanı Memişoğlu duyurdu: Evde Sağlık Hizmetleri Koordinasyon Merkezi pilot illerde başlatıldı', U.medi('evde-saglik'), false],
  ['news-medimagazin-haber-whole', 'Son kullanma tarihi geçmiş kanser ilaçlarına 11 ilde operasyon: 22 gözaltı', U.medi('operasyon'), false],
  ['news-medimagazin-haber-whole', 'Lise öğrencileri tarantula zehrinden yatak yaralarının tedavisine yönelik hidrojel geliştirdi', U.medi('tarantula'), false],
  ['news-medimagazin-haber-whole', 'Cumhurbaşkanı Erdoğan: Tıp ve hekimlik, hayati bir öneme sahiptir', U.medi('erdogan'), false],

  ['news-aa-saglik-scoped', 'Türkiye\'de kan kanseri hastaları için "hücre" tedavisi dönemi başladı', U.aa('hucre'), true],
  ['news-aa-saglik-scoped', 'Türkiye robotik cerrahide ileri seviyeye ulaştı', U.aa('robotik'), true],
  ['news-aa-saglik-scoped', "Nobel ödüllü Meldal'dan yan etkisiz kanser tedavisine umut olacak çalışma", U.aa('nobel'), true],
  ['news-aa-saglik-scoped', 'Dünya Sağlık Örgütüne göre, 2024\'te sıtma nedeniyle 610 bin kişi hayatını kaybetti', U.aa('sitma'), true],
  ['news-aa-saglik-scoped', 'Bilkent Şehir Hastanesi\'nde "Kalp Sağlığı Haftası" programı düzenlendi', U.aa('bilkent'), false],
  ['news-aa-saglik-scoped', 'Kocaeli Şehir Hastanesi 3 yılda 7 milyondan fazla poliklinik hizmeti verdi', U.aa('kocaeli'), false],
  ['news-aa-saglik-scoped', 'Yaşlılarda enfeksiyonlara karşı en etkili koruma "aşı"', U.aa('asi'), false],
  ['news-aa-saglik-scoped', 'Uzmanından "Dijital kültür, dopamin bağımlılığını artırıyor" uyarısı', U.aa('dopamin'), false],
];

describe('Haber lane press rules (owner PASS/FAIL, live headlines 2026-11-03)', () => {
  for (const [feed, title, url, expected] of CASES) {
    it(`${feed}: ${expected ? 'KABUL' : 'RED'} — ${title.slice(0, 60)}`, () => {
      assert.equal(passes(feed, title, url), expected);
    });
  }
});
