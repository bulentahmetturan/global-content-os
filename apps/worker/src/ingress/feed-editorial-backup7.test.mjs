import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { editorialRejection } = await import('./feed-editorial.ts');
const { applyFeedUrlScope } = await import('./feed-scope.ts');

const CUM = 'news-cumhuriyet-saglik-whole';
const INDY = 'news-indyturk-saglik-whole';
const HBT = 'news-herkesebilim-saglik-whole';
const rej = (feed, title, summary = '') => editorialRejection(feed, title, summary);

// Real headlines scanned 2026-11-03 from the live feeds; owner accept/reject decisions the same day (backup list 26-32).
describe('Cumhuriyet sağlık', () => {
  it('keeps expert warnings, consumer tips and Türkiye health data', () => {
    assert.equal(rej(CUM, 'Her halsizlik ve kemik ağrısı lösemi belirtisi mi? Uzman isimden ailelere kritik uyarı'), null);
    assert.equal(rej(CUM, 'Kan tahlilinde CRP yüksek çıkanlar dikkat: Her zaman enfeksiyon anlamına gelmiyor'), null);
    assert.equal(rej(CUM, 'Vegan beslenmede doğru bilinen yanlışlar'), null);
    assert.equal(rej(CUM, 'Türkiye Avrupa’nın obezite ve diyabet şampiyonu: Her 100 kişiden 66’sı ideal kilonun üzerinde'), null);
  });
  it('rejects sensational wording and single-person stories', () => {
    assert.equal(rej(CUM, 'Küçük ama etkili mucize: Keten tohumunun faydaları nelerdir, ne kadar tüketilmeli?'), 'sensational-headline');
    assert.equal(rej(CUM, 'Tıp dünyasında ezber bozan keşif: Tiroid bezinde yeni hücre tipi tanımlandı'), 'sensational-headline');
    assert.equal(rej(CUM, "13 yaşındaki Matilda'ya 'enfeksiyon' denildi, arka arkaya iki kez felç geçirdi"), 'single-person-story');
  });
  it('reads only /saglik/ links', () => {
    const items = [{ url: 'https://www.cumhuriyet.com.tr/saglik/vegan-beslenmede-dogru-1' }, { url: 'https://www.cumhuriyet.com.tr/turkiye/istanbul-da-ust-solunum-2' }];
    assert.deepEqual(applyFeedUrlScope(CUM, items).map((i) => i.url), [items[0].url]);
  });
});

describe('Independent Türkçe sağlık', () => {
  it('keeps translated research and lifestyle headlines', () => {
    assert.equal(rej(INDY, 'Basit uyku testi, kalp hastalığı riskini 10 yıl önceden tahmin edebiliyor'), null);
    assert.equal(rej(INDY, 'Raporlu ilaç kullanan hastalar için yeni düzenleme geliyor'), null);
  });
  it('rejects global outbreaks, minister calls and conspiracy items', () => {
    assert.equal(rej(INDY, "DSÖ açıkladı: KDC'de Ebola nedeniyle yaklaşık 4 bin 900 kişi öldü"), 'global-outbreak');
    assert.equal(rej(INDY, "Çocuk felci benzeri hastalığa yol açabilen virüs Kaliforniya'da yayılıyor"), 'global-outbreak');
    assert.equal(rej(INDY, "Sağlık Bakanı Memişoğlu'ndan küresel sağlık güvenliği için ortak sorumluluk çağrısı"), 'minister-or-call');
    assert.equal(rej(INDY, 'ABD Sağlık Bakanlığı, dikkatini 5G komplo teorisine çevirdi'), 'conspiracy');
  });
});

describe('Herkese Bilim Teknoloji', () => {
  it('keeps Medicine Nobel and health research, rejects other prizes and magazine notices', () => {
    assert.equal(rej(HBT, 'Tıp Nobeli, beyni ışıkla kontrol etmeyi sağlayan optogenetik keşiflerine verildi'), null);
    assert.equal(rej(HBT, 'Egzersiz, beyinde yeni nöronların oluşumunu tetikliyor'), null);
    assert.equal(rej(HBT, 'Fizik Nobeli, evrenin “hayalet parçacıklarını” yakalayan Francis Halzen’e verildi'), 'non-medicine-nobel');
    assert.equal(rej(HBT, '2026 Nobel Edebiyat Ödülü, Anne Carson’a verildi'), 'non-medicine-nobel');
    assert.equal(rej(HBT, 'HBT Dergi 544. sayı – 30 Ekim 2026'), 'magazine-issue');
  });
  it('reads only /haberler/saglik/ links', () => {
    const items = [
      { url: 'https://www.herkesebilimteknoloji.com/haberler/saglik/egzersiz-beyinde' },
      { url: 'https://www.herkesebilimteknoloji.com/haberler/yasam/jaguar-gaspar' },
      { url: 'https://www.herkesebilimteknoloji.com/yazarhp/iyi-misiniz' },
    ];
    assert.deepEqual(applyFeedUrlScope(HBT, items).map((i) => i.url), [items[0].url]);
  });
});
