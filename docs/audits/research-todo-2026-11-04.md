# Research TODO — aile aile, kaynak kaynak (2026-11-04)

Bible §26.1 kaynak başına görüşme ister; 65 ayrı görüşme yerine **yayıncı ailesi başına bir oturum** yapılır, ama her kaynağın cevabı ayrı kaydedilir (aynı tür farklı kaynakta farklı karar alabilir, §26.4/3). Her oturum: gerçek başlıklarla tür → PASS/FAIL → kural + test → kuru çalıştırma.

## A. Kodla yapılacak genel adımlar (sahip cevabı gerekmez)

- [ ] G1 Medya/basın: DOI/PMID/özgün bağlantı yoksa HOLD (§13.6)
- [ ] G2 Makale dışı tür kapısı (§26.6)
- [ ] G3 Düzeltme/geri çekme + `integrity_check` kaynağı (§13.4)
- [ ] G4 Kanıt üst verisi doldur, sonra türü bilinmeyeni HOLD (§13.1/13.2)
- [ ] G5 `cadence_class`/`staleness_threshold` + erişim seviyesi alanı (§25, §13.5)

## B. Görüşme sırası (aile → kaynak)

### 1. Medya / haber kaynakları (basın bülteni, görüş, özet)

- [ ] **stat-news** — kitap kararı; tür PASS/FAIL → kural+test; makale dışı tür sızıyor; özgün bağlantı yoksa HOLD
- [ ] **medical-xpress** — kitap kararı; tür PASS/FAIL → kural+test; özgün bağlantı yoksa HOLD
- [ ] **asn-news** — kitap kararı; tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **nature-news** — kitap kararı; tür PASS/FAIL → kural+test

### 2. Klinik dergiler

- [ ] **nejm** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **nejm-ai** — tür PASS/FAIL → kural+test
- [ ] **jama-network** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor; düzeltme/erratum sızıyor
- [ ] **the-lancet** — tür PASS/FAIL → kural+test
- [ ] **lancet-digital-health** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor; düzeltme/erratum sızıyor
- [ ] **bmj** — tür PASS/FAIL → kural+test

### 3. Kardiyoloji / solunum dergileri

- [ ] **jacc** — tür PASS/FAIL → kural+test
- [ ] **circulation-aha** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor
- [ ] **jaha** — tür PASS/FAIL → kural+test
- [ ] **european-heart-journal** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor; düzeltme/erratum sızıyor
- [ ] **european-respiratory-journal** — tür PASS/FAIL → kural+test
- [ ] **chest-journal** — tür PASS/FAIL → kural+test

### 4. Nature / Cell ailesi

- [ ] **nature** — kitap kararı; tür PASS/FAIL → kural+test
- [ ] **nature-medicine** — tür PASS/FAIL → kural+test
- [ ] **nature-genetics** — kitap kararı; tür PASS/FAIL → kural+test
- [ ] **nature-biotechnology** — kitap kararı; tür PASS/FAIL → kural+test
- [ ] **npj-digital-medicine** — tür PASS/FAIL → kural+test
- [ ] **cell** — kitap kararı; tür PASS/FAIL → kural+test
- [ ] **nature-ageing-hub** — tür PASS/FAIL → kural+test
- [ ] **nature-nutrition-hub** — tür PASS/FAIL → kural+test

### 5. Dijital sağlık / mühendislik

- [ ] **jmir** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor
- [ ] **ieee-jbhi** — kitap kararı; tür PASS/FAIL → kural+test
- [ ] **ieee-tbme** — kitap kararı; tür PASS/FAIL → kural+test; makale dışı tür sızıyor

### 6. API / indeks / kayıt

- [ ] **cochrane-library** — tür PASS/FAIL → kural+test
- [ ] **clinicaltrials-gov-api-v2** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **crossref-rest-api** — tür PASS/FAIL → kural+test; verim: gerekli mi?
- [ ] **openalex-api** — tür PASS/FAIL → kural+test; verim: gerekli mi?
- [ ] **europe-pmc-rest** — yalnız genel adımlar
- [ ] **pubmed-central-oa** — tür PASS/FAIL → kural+test; verim: gerekli mi?; teknik hata; çekim gecikmiş
- [ ] **pubmed-eutilities** — çekim gecikmiş

### 7. PubMed beslenme / yaşlanma / destek dergileri (31 kaynak, tek aile görüşmesi, kaynak başına kayıt)

- [ ] **pubmed-advances-nutrition** — tür PASS/FAIL → kural+test
- [ ] **pubmed-age-ageing** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor; düzeltme/erratum sızıyor; eski kayıt: yaş sınırı
- [ ] **pubmed-aging-longevity** — tür PASS/FAIL → kural+test
- [ ] **pubmed-ajcn** — tür PASS/FAIL → kural+test
- [ ] **pubmed-bmc-cmt** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **pubmed-bmj-nph** — tür PASS/FAIL → kural+test; verim: gerekli mi?
- [ ] **pubmed-br-j-nutr** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **pubmed-clin-nutr** — tür PASS/FAIL → kural+test
- [ ] **pubmed-ctm** — tür PASS/FAIL → kural+test
- [ ] **pubmed-curr-dev-nutrition** — tür PASS/FAIL → kural+test
- [ ] **pubmed-exp-gerontol** — tür PASS/FAIL → kural+test
- [ ] **pubmed-explore** — tür PASS/FAIL → kural+test
- [ ] **pubmed-front-aging** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor; eski kayıt: yaş sınırı
- [ ] **pubmed-front-nutr** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor
- [ ] **pubmed-gerontologist** — tür PASS/FAIL → kural+test
- [ ] **pubmed-imr** — tür PASS/FAIL → kural+test
- [ ] **pubmed-integrative** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **pubmed-j-diet-suppl** — tür PASS/FAIL → kural+test
- [ ] **pubmed-jand** — tür PASS/FAIL → kural+test
- [ ] **pubmed-japha** — tür PASS/FAIL → kural+test; verim: gerekli mi?
- [ ] **pubmed-jgosa** — tür PASS/FAIL → kural+test
- [ ] **pubmed-jicm** — tür PASS/FAIL → kural+test
- [ ] **pubmed-journal-of-nutrition** — tür PASS/FAIL → kural+test
- [ ] **pubmed-mech-ageing** — tür PASS/FAIL → kural+test
- [ ] **pubmed-nat-aging** — tür PASS/FAIL → kural+test
- [ ] **pubmed-nat-metab** — tür PASS/FAIL → kural+test
- [ ] **pubmed-nutrients** — tür PASS/FAIL → kural+test
- [ ] **pubmed-nutrition-journal** — tür PASS/FAIL → kural+test; makale dışı tür sızıyor; düzeltme/erratum sızıyor; eski kayıt: yaş sınırı
- [ ] **pubmed-nutrition-reviews** — tür PASS/FAIL → kural+test
- [ ] **pubmed-ph-nutr** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
- [ ] **pubmed-supplements** — tür PASS/FAIL → kural+test; eski kayıt: yaş sınırı
## C. En sonda (unutma)

- [ ] **Z. Bible'a yöntemi yaz (sahip talebi 2026-11-04):** bundan sonra eklenecek her kaynak da bu yöntemle girer: yayıncı ailesi oturumu → canlı kayıtlardan gerçek başlıklı tür tablosu → sahibe sade Türkçe PASS/FAIL → cevap kaynak kuralına + fixture/teste → kuru çalıştırma → `docs/audits/` kaydı → sürekli geri besleme. Ne yaptıysak (aile gruplaması, kaynak başına ayrı kayıt, öneri önde, belirsiz tür FAIL) Bible §26.1/§26.6'ya işlenir.
