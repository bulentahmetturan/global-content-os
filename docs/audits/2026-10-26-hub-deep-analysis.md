# Hub deep analysis and status of earlier criticisms (2026-10-26)

Read-only (Wrangler D1 queries on production plus the interview gates run locally over every open item). Companion to [2026-10-24-hub-full-audit.md](2026-10-24-hub-full-audit.md) and [2026-10-24-source-lane-audit.md](2026-10-24-source-lane-audit.md).

## 1. Status of the owner's earlier criticisms
| Criticism | Status | Evidence |
|---|---|---|
| News appear in Duyuru | PARTLY FIXED | New items from 17 news outlets and pubmed now go to Haber/Research (Worker c8e59704). 50 existing items moved (29 Haber, 21 Research). 111 stale news items and Medical Economics (83) are still in Duyuru. |
| Announcements appear in Haber | NOT FIXED, small | About 5-8 genuine announcements sit in Haber (EC DG SANTE and EC HTA webinars, TÜSEB TEKNOFEST contest, WHO workshop). No mechanism yet to move them; needs the type tag and the "Duyuru olmalı" button (todo 2, 3). |
| Research list looked entirely English | FIXED | Last 3 days: 378 of 378 new research items and 135 of 153 new news items translated; only 12 news and 156 research items wait. (The earlier cause was the Workers AI daily quota.) |
| Rating disappeared after Gönder | FIXED | Deployed; saved notice stays on the item. |
| Learner and predictions | BUILT, no data | Scoring routes, tables and Hub predictions are live; zero ratings so far, so the system runs on the interview rules only. |
| Interview rules as hard gates | WORKS, conservative | Gates catch only 9% of Haber, 7% of Research, 4% of Duyuru open items (US regulation 139, animal-only 75, preprint 42, local study 43, local outbreak 26, trade 24). The rest needs the learner and owner ratings. |
| Hold pile / expiry | WORSE | Haber hold grew from 1,090 to 1,314; 86 inbox news items are older than 30 days and 82 older than 180 days; Research has 536 inbox items older than 180 days and 228 undated. Auto-expiry not built yet. |
| Duyuru only while application open | NOT FIXED | 0 of 415 open Duyuru items carry `deadline_at`. |
| Medical Economics empty titles | ROOT CAUSE FOUND, not fixed | 83 of 83 titles are empty while the URL slug is readable; a title can be derived from the slug or the page title. Content is physician business news and a "morning medical update" digest, fitting none of the three channels well. |
| Burs/Eğitim tiles show 0 | NOT FIXED | 10 burs/egitim items exist; none is TIME_SENSITIVE inside the tile window. |
| Doctors' Facebook and Instagram | WAITING on the owner | Owner will connect the accounts shortly; Instagram intake can then be resumed (parked since 2026-10-23). |

## 2. New owner rule (2026-10-26): international scholarships and announcements must include students in Türkiye
A scholarship, program or announcement abroad qualifies for Duyuru/Burs/Eğitim only if students based in Türkiye (or Turkish citizens applying from Türkiye) can use it. "Open to Turkish students already studying in Canada" is not enough. Items that are only for people already in the destination country, or for citizens/residents of that country, do not qualify. Consequence for the data: the check must read the eligibility, not just the topic.

## 3. Duyuru / Burs / Eğitim (415 open inbox)
- The `abroad_*` sources mostly scrape navigation pages as if they were items: "THE MATCH logo", "Intro to The Match", "Match Calendars", "Reschedule an Exam", "Bulletin of Information", "Examination & service fees". They carry `decision_route = REJECTED_LEGACY` (the old rule recognised them as not announcements) but stay open: abroad_us_nrmp 24 of 24, abroad_us_usmle 15 of 15, hasuder_public_health 11 of 11, moh_physician_workforce 10 of 11, abroad_ca_mcc_img_pathways 12 of 21, tuk_specialty_training 5 of 7. About 110 items in total.
- Real announcements among them are few and mostly for foreign applicants to Canada/US (e.g. "January 2027 TDM Examination application is now open", "MCCQE scheduling is now open"). Whether people in Türkiye can use them is not stated in the title, so the eligibility rule in section 2 decides.
- ÖSYM sources (TUS, DUS, YDUS: 58 items) fit the audience, but 41 are older than 60 days (results announced long ago): expiry needed.
- Medical Economics 83 (all empty titles), 111 stale news items left from the lane move, 5 doctor blog posts, plus professional bodies (tdb_dental 20, ttb_national 8, tvhb_veterinary 8, tpd_psychiatry 4) that mix statements with announcements.
- Translation: only 96 of 415 are enriched (317 are "skipped" by design in this pipeline); Turkish items need none, English ones do.

## 4. Haber (567 inbox, 458 TIME_SENSITIVE)
- Interview gates flag 9%: raps-regulatory 79%, medtech-dive 32%, reuters 29%, hpw 17%, medpagetoday 11%. Clean sources: aa-saglik, cleveland-clinic-health-essentials, medical-news-today, who-newsroom, medikalnews, sondakika.
- Haber hold pile 1,314 (578 without acquisition path + 736 time-sensitive) is a dump: the owner's "Beklet" has no expiry.
- Announcements in news: see section 1 (webinars, registrations, contests). Foreign-language regulators (ANSM French, PMDA Japanese) need translation to be usable.
- Newswise stays the largest source (184 open, 4% gated) but many items are university PR outside medicine.

## 5. Research (4,008 inbox, 2,191 TIME_SENSITIVE)
- Gated 7%: medrxiv 39 of 39 (preprints), pubmed-bmc-cmt 47%, stat-news 22% (US regulation), pubmed journals with animal-only work 13-17%, jama-network 14% (US policy).
- stat-news (284 open) is news in the Research lane; its 22% US-regulation rate matches the owner's "single-country policy" rule.
- Not research by the owner's definition (unchanged from the 10-24 audit): ClinicalTrials.gov registry entries, GDELT, NIH/NCCIH dbGaP records, Nature News feed residue (Google News legacy). Closing decisions are in todo 14.
- 156 items still wait for translation; 536 inbox items are older than 180 days.

## 6. Evergreen and modules (unchanged since 10-24 unless stated)
- Sağlık & Referans 52 shown (88 evergreen in the inbox): Cleveland Clinic only; fit for İyileşme Kanalı. Research Rediscovery 4 shown: patient guides among them.
- Modules: Dossier clinicaltrials-frontier still in the pause/resume cycle; Doctors 9 actors, 14 candidates; Protocols 6 canonical; Discovery waves open; Statistics healthy.

## 7. New TODO items (added to the audit checklist)
26 Eligibility rule for Türkiye (section 2); 27 reject the ~110 REJECTED_LEGACY navigation items through the triage function; 28 scraper profile: drop generic navigation titles; 29 Medical Economics titles from slug; 30 Facebook/Instagram intake after the owner connects the accounts; 31 hold-pile policy (Haber 1,314).

## 8. Bible v4 ile denetim (owner 2026-10-26: "her şeyi Bible'a göre audit edeceksin")
Kaynak: `apps/hub/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` (Hub kopyası; kanonik dosya `adapters/tip-toplulugu-radar/content/`). Bible otorite sırasında en üsttedir (§0.1); kanal görüşmesi kuralları (Kaduse/Tıp/İyileşme) Config/kanal katmanıdır ve Bible'ı daraltabilir, gevşetemez. Bible'da kanal kavramı yoktur; yalnızca 5 içerik kategorisi ve Türk tıp öğrencisi/sağlık profesyoneli hedef kitlesi vardır.

### 8.1 Bible'ın bu denetimi doğrudan belirleyen maddeleri
- §2 kategoriler: Haber = hedef kitleyi doğrudan ilgilendiren güncel gelişme; Burs = Türk hedef kitlenin başvurabileceği fon; Eğitim = başvurulabilir eğitim; Duyuru = kongre, sınav, mevzuat, çağrı, kontenjan, başvuru takvimi, kurumsal ilan; Research = klinik/kariyer değeri olan araştırma. Her içerik tek primary category alır (§2.1, §11.1).
- §12.1 / §12.4: Türkiye uygunluğu üç ayrı eksen: application eligibility (Türk vatandaşı / Türkiye'de okuyan veya çalışan başvurabilir mi), credential recognition, practice rights. Burs/Eğitim için zorunlu alanlar: `application_eligibility`, `eligibility_evidence_url`, `nationality_rule`, `residency_rule`, `institution_rule`, `language_rule`, `visa_rule`. Statüler YES/PARTIAL/NO/UNKNOWN/NOT_APPLICABLE; resmî kanıt yoksa UNKNOWN veya PARTIAL (§12.3). Duyuru başvuru içermiyorsa `turkey_relevance` değerlendirilir (§12.5); Haber/Research için başvuru uygunluğu N/A (§12.6).
- SPF-10/11/12: Duyuru "aksiyon alınabilir resmî ilan", süresi dolmuş veya aksiyon alınamayan ITEM PASS olamaz. Burs: "Türk hedef kitlenin gerçekten başvurabileceği"; açıkça başvurulamayan PASS olamaz. Eğitim: Türk hedef kitlenin katılabildiği.
- §20.3 deadline güvenliği: deadline belirsizse fırsat "open" gösterilemez; `unknown` veya `human_review`. Hard gate: "tarihi geçmiş fırsatın açıkmış gibi sunulması".
- §0.4 / §36: UNKNOWN tahminden iyidir; fail-closed; sessiz fallback yok.
- SPF-6/7, §19.2: ITEM REJECT ≠ SOURCE FAIL; teknik sorun veya düşük verim kaynağı FAIL yapmaz; kaynak silinmez, lifecycle (CONDITIONAL/WATCH/PAUSED/MANUAL_ONLY/retired) ve gerekçe kodu ile yönetilir.
- §6.4, §10.5, §24.2: sosyal medya yalnızca discovery/yardımcı kanıttır; birincil kaynak kazanır; canonical doğrulama yerine geçmez.
- §13: Research ve sağlık iddiası içeren Haber için kanıt kapısı; preprint açıkça etiketlenir (reddedilmez); hayvan/in-vitro insan tedavisi gibi sunulamaz.
- §22.1 hedef kitle sözlüğü: medical_student, intern, resident, physician, specialist, dentist, pharmacist, nurse, midwife, veterinarian, physiotherapist, dietitian, clinical_psychologist, researcher vb.

### 8.2 Bible'a göre değişen tespitler
1. Türkiye kuralı artık yeni bir buluş değil, Bible §12 uygulamasıdır: owner'ın "Kanada'daki Türk öğrenciler yetmez" kuralı, `application_eligibility = YES` (Türkiye'de okuyan/çalışan ya da Türk vatandaşı olarak Türkiye'den başvurabilir) koşuludur. Kanada'da zaten okuyanlara özel ilan = NO; belirsiz = UNKNOWN → HUMAN_REVIEW (open gösterilmez). Yeni bir "ABROAD_ONLY" bayrağı yerine `nationality_rule` / `residency_rule` alanları çıkarılmalı.
2. Duyuru ölçütü "resmî ilan"dır: Medical Economics (83, hekim iş dünyası haberi/özet bülteni) Duyuru ölçütünü karşılamaz; olsa olsa Haber adayıdır (ve hedef kitle ilgisi içerik bazında). Genel gezinme sayfaları ("THE MATCH logo", "Bulletin of Information") ITEM düzeyinde SPF-10'a takılır: REJECT (gerekçe kodlu), kaynak FAIL değil; kaynağın kazıma profili düzeltilir.
3. Düzeltme (önceki bölüm 3): gerçek sınav/başvuru ilanları (USMLE, MCCQE, TDM sınav başvurusu) Bible §2'ye göre "sınav" Duyurusu olabilir; Türkiye'den başvurulabilir olup olmadıkları başlıktan bilinmiyor, kanıt yoksa UNKNOWN. "Yalnızca yabancı başvuranlar içindir" demek de tahmindir; eligibility sayfasından okunmalı.
4. Meslek grupları kapsam dahilidir: tdb_dental, tvhb_veterinary, tpd_psychiatry, hemşire/eczacı kaynakları hedef kitle sözlüğündedir; "tıp dışı" diye elenmemeli. (Kaduse Haber/İyileşme kanalı daha dar olabilir; bu kanal kuralı, Bible değil.)
5. Deadline: 415 açık Duyuru öğesinin hiçbirinde `deadline_at` yok; Bible'a göre bunlar "open" gösterilemez → `unknown`/human_review ya da süresi dolmuş sayılıp gizlenir. ÖSYM'deki 41 eski sonuç duyurusu "süresi dolmuş" sınıfıdır.
6. Kaynak kapatma dili düzelir: GDELT, NIH/NCCIH, medRxiv, Nature News yüzünden "kapatma" Bible'da kaynak FAIL değildir (hard FAIL şartı yok); doğru dil lifecycle: `retired`/`paused` + reason code + ITEM REJECT, silme yok. medRxiv için Bible preprint'i etiketle der; reddi kanal kuralıdır (owner kararı), kaynak FAIL değil.
7. Owner'ın kanal kuralları Bible'dan daha dar olan yerler (çelişki değil, kanal filtresi): preprint reddi, tek ülke mevzuatı/fiyatı Haber'e girmez (Bible Haber "Türkiye ilgisi" ile uyumlu), hayvan çalışması yalnızca insan çıkarımıyla (Bible §13.2 ile uyumlu), DOI/PMID'li haber/araştırma (Bible §0.2 provenance ile uyumlu).
8. Doktorların Facebook/Instagram paylaşımları: Bible §6.4 gereği bireysel akademisyen hesabı yalnızca yardımcı keşif/evidence; her paylaşım birincil kaynağa (makale/DOI, kurum duyurusu) çözülmeden Haber/Research olamaz. Instagram alımı "discovery kaynağı" olarak tasarlanmalı.
9. Haber ve Research için Bible "birincil kaynak" arar (§24.3): Newswise/Medical Xpress tipi PR/aggregator kayıtları discovery rolündedir; Haber'de canonical kaynağı bulunmayan öğe HOLD/HUMAN_REVIEW'a gider. Bu, 1.314 öğelik bekletme yığınının bir bölümünü açıklar.
10. Her karar için "Bible Compliance Envelope" (§0.2) üretilmesi gerekir. Hub'daki triyaj eylemleri `editorial_decisions` ve `review_feedback` yazıyor; envelope alanlarının (rule_id, ruleset, reason_codes, human_override) ne kadarının üretildiği ayrıca denetlenecek (todo 38).

### 8.3 Bible'a göre eklenen / revize edilen TODO
Bkz. 2026-10-24-hub-full-audit.md, 2026-10-26 Bible bölümü (madde 26 revize; 32-38 yeni).
