import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const S = await bundle('apps/worker/src/ingress/source-policy.ts', 'source-policy-aa');
const AA = 'news-aa-saglik-scoped';
const v = (t) => S.sourcePolicyVerdict(AA, t);

test('AA Sağlık: professional or wow items pass', () => {
  for (const t of [
    "Türkiye'de kan kanseri hastaları için hücre tedavisi dönemi başladı",
    'Türkiye robotik cerrahide ileri seviyeye ulaştı',
    'Annenin gençliğinde oluşan mutasyon bebeğinde hemofiliye yol açabiliyor',
    'Yaşlılarda enfeksiyonlara karşı en etkili koruma aşı',
    "Nobel ödüllü Meldal'dan yan etkisiz kanser tedavisine umut olacak çalışma",
    'Dünya Sağlık Örgütüne göre, 2024&#x27;te sıtma nedeniyle 610 bin kişi hayatını kaybetti',
    'Türkiye&#x27;de kan kanseri hastaları için "hücre" tedavisi dönemi başladı', // stored with HTML escapes
  ]) assert.equal(v(t), 'pass', t);
});

test('AA Sağlık: local hospital stories, ceremonies, minister posts and consumer warnings are refused', () => {
  for (const t of [
    "Van'daki kalp merkezi hizmete girdi",
    'Ege Üniversitesi Hastanesinde 28 yılda 308 kalp nakli yapıldı',
    'Açıkta satılan gıdalar "doğal" algısıyla risk oluşturabilir uyarısı',
    'Dijital kültür dopamin döngüsünü bozuyor',
    'Sağlık Bakanı Memişoğlu\'ndan "organ bağışı" paylaşımı',
    'Kalp kriziyle gittiği hastanede prostat kanseri olduğunu öğrenen kişi sağlığına kavuştu',
    '21 yıldır çektiği kamburluktan 12 saatlik ameliyatla kurtuldu',
    'Bilkent Şehir Hastanesinde Kalp Sağlığı Haftası programı düzenlendi',
  ]) assert.equal(v(t), 'deny', t);
});
