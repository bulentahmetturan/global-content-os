# Source-to-lane audit: Duyuru hattı (2026-10-24)

Read-only audit of production D1 (open items: `triage_status` inbox or hold). Trigger: owner observed that items from sondakika.com (news) appear in the Duyuru lane.

## Finding
All 453 open items in the Duyuru lane (`route = tip-ogrencileri`) arrive through ONE feed, `tip-toplulugu-phase1-canary`, and the lane is assigned per feed, not per source or per item. So every source on that feed lands in Duyuru whatever its nature. About 48% of the lane is news.

## Classification by source (proposal, owner to confirm)
| Group | Sources (open items) | Items | Proposed lane |
|---|---|---|---|
| A. Duyuru / Burs / Eğitim (stays) | osym_medical_exams 24, osym_ydus_subspecialty_exams 20, osym_dus_dental_exams 14, abroad_* (us_nrmp 24, ca_mcc_img_pathways 19, us_usmle 15, au_ahpra, ca_carms, it_salute, sa_scfhs 1 each), burs_* 5, egitim_* 2, tuk_specialty_training 7, titck_announcements_general 1, resmi_gazete_medical_regulation 3, ttb_national 8, tdb_dental 21, tpd_psychiatry 4, tahud_family_medicine 3, turk_pediatri_kurumu 3, ttd_thoracic 1, turkmsic_medical_students 2, hasuder_public_health 11, tvhb_veterinary 8, moh_physician_workforce 11 | 210 | Duyuru (professional bodies publish both announcements and statements; item-level check still needed) |
| B. Haber (should move) | medical_economics 72, sondakika_saglik 39, saglikpersonelihaberi_net 22, biopharma_dive 19, dha_saglik_yasam 15, trthaber_saglik 10, medical_xpress 8, euronews_tr_saglik 5, medicalresearch_com 5, medpage_today 5, ahaber_saglik 3, healthline_news 3, sabah_saglik 3, fierce_biotech 2, yale_medicine_news 2, anadolu_ajansi_medical_radar 1, foodnavigator 1, saglikhaberi_net 1, stat_news 1 | 217 | Haber (kaduse-news) |
| C. Araştırma | pubmed_biomedical_evidence | 21 | Araştırma (kaduse-research) |
| D. Doctor lane carrier (feed disabled) | ep_drahmetekmekci-com | 5 | Doctors flow, not Duyuru |

## Further problems seen
- `medical_economics`: 72 items, most with an empty title (ingestion issue, separate from lane).
- `decision_route = REJECTED_LEGACY` on ~90 open items (hasuder, moh_physician_workforce, abroad_*, pubmed): an old rule marked them rejected but they sit in the open list.
- Business and practice-management sources (medical_economics, medicalresearch_com) fit none of the three channels well; candidate for removal rather than re-routing.
- Some Group A bodies (ttb_national, tdb_dental, tpd_psychiatry) publish statements and news next to real announcements, so a source-level rule alone will not be exact.

## Constraints on the fix
- Re-routing the source on the producer side and moving the existing items are production writes: owner-run, with a read-only check before and after.
- Nothing moves automatically; a rule that changes routing needs the owner's confirmation of the table above first.

## TODO (audit sonucu)
Sahip: [O] owner karar/üretim yazması, [C] Claude (kod, salt okunur doğrulama).

1. [O] Karar: B grubundaki 19 kaynak Haber hattına gitsin mi? Medical Economics ve MedicalResearch.com için "kapat" mı "Haber'e taşı" mı?
2. [O] Karar: C grubu (`pubmed_biomedical_evidence`) Araştırma hattına gitsin mi? D grubu (`ep_drahmetekmekci-com`) Doktorlar akışında mı kalsın?
3. [O] Karar: A grubundaki karışık yayın yapan kurumlar (TTB, TDB, TPD, TAHUD, hasuder, tvhb, moh_physician_workforce) için öğe bazlı tür kontrolü istiyor musunuz?
4. [C] Kaynak-hat eşlemesini üretici tarafta (tip-toplulugu radar yapılandırması) bul; hangi dosyada olduğunu, değişikliğin yeni gelen öğeleri nasıl etkileyeceğini yaz; test ekle. Henüz değişiklik yok.
5. [C] Mevcut 453 öğe için taşıma betiği hazırla: önce kuru çalıştırma (hangi öğe nereye), geri alma sorgusu, sayım doğrulaması. Çalıştırmak 6. adımda sahipte.
6. [O] Taşıma betiğini çalıştır (canlı veri yazması). [C] Öncesi/sonrası salt okunur sayım doğrulaması.
7. [C] `medical_economics` boş başlık sorununu incele (ingestion; ayrı hata).
8. [C] ~90 `REJECTED_LEGACY` öğeyi listele: neden açık listede duruyorlar; [O] hangilerinin kalıcı reddedileceğine karar.
9. [C] Skorlamaya "tür tahmini" ekle (Duyuru/Burs/Eğitim, Haber, Araştırma) ve Hub'da "Haber olmalı" rozeti; yeni kaynak yanlış hatta düşerse yakalasın.
10. [C] Duyuru kuralı: yalnızca başvuru açıkken (deadline_at) geçerli; süresi geçenler otomatik elensin (röportaj kuralı).
11. [C] Kaynak denetimini Haber ve Araştırma hatları için de yap (aynı biçimde kaynak/hat/içerik uyumu).
12. [O/C] Taşıma bittikten sonra puanlamaya başla (kategori düzgünken puanlar öğrenmeyi bozmaz).
