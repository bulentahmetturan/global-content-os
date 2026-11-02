#!/usr/bin/env bash
# Owner-decided registration (2026-11-03, Bible 26.1 PASS/FAIL interview, 4 rounds) of the ten Tıp Topluluğu registry sources
# that had no Haber presence: NTV Sağlık, BBC Türkçe Sağlık, DHA Sağlık-Yaşam, TTB, HASUDER, Türk Toraks, KLİMİK, TKD, TPD, TDB.
# One source per lane per publisher; rules: docs/audits/2026-11-03-haber-gap-10-sources-owner-decisions.md.
# usage: bash scripts/ops/2026-11-03-register-gap-sources.sh [--apply]    (without --apply: dry run, nothing written)
set -euo pipefail
APPLY="${1:-}"
export MSYS_NO_PATHCONV=1
# Rejected in every lane: condolence, national holiday greetings, member perks, sponsor/firm academies, journal/bulletin issue notices,
# "done/held" notices without outcome, short-lived "case filed" items (owner 2026-11-03: continuity matters, short-term news is out).
SOC_EX="vefat,başsağlığı,acı kaybımız,anısına,taziye,kutlu olsun,bayram,tömer,petrol ofisi,positive kart,kredi,indirim,aidat,üyelik,meril,academy,sponsor,advertorial,dergi,bülten,sayısı yayımlandı"
DONE_EX="yapıldı,gerçekleştirildi,gerçekleşti,tamamlandı"
OZEL_IN="günü,haftası,ayı,farkındalık,bilgi notu,basın bildirisi,bildirisi"
EGITIM_IN="kongre,kurs,sempozyum,toplantı,workshop,masterclass,webinar,web konferans,video,eğitim programı,kurultay,panel,takvimi,endorse,course,meeting"
add() { # id heading name url include exclude reason [paths] [allow-congress]
  node scripts/source-lifecycle.mjs add "$4" --channel tip_toplulugu --heading "$2" --source-id "$1" --name "$3" \
    --include "$5" --exclude "$6" --shared-endpoint "$7" ${8:+--paths "$8"} ${9:+--allow-congress true} $APPLY 2>&1 | grep -E "^ADD|GATES|CANARY|QUESTION|BLOCK|ADAPTER" | cut -c1-240 || true
}
amend() { # id reason include exclude [forbid] [allow-congress]
  node scripts/source-lifecycle.mjs amend "$1" --reason "$2" --include "$3" --exclude "$4" ${5:+--forbid "$5"} ${6:+--allow-congress true} $APPLY 2>&1 | grep -E "^AMEND|OUTCOME|DENIED|BLOCK" | cut -c1-240 || true
}
# --- General press (Haber lane; keyword approximation of the owner's type rules, validated on the live sample in the dry run) ---
PRESS_EX="mucize,şifa,ünlü,magazin,burç,astroloji,reklam,sponsorlu,geri ödeme,bakan,saldırı,ihmal,paranormal,hayalet,aldatabilir,sahte botoks,medikal turizm,hastane açılışı,ücretli klinik"
amend ntv_saglik "NTV Haber leg: owner 2026-11-03 (herbal/gallery out, MHRS service in, science with named finding in)" \
  "uzman,prof,doç,araştırma,çalışma,keşif,bilim,kanser,aşı,salgın,mhrs,randevu,tedavi,ilaç,hastalık,ameliyat" "$PRESS_EX,çay,galeri,kurutularak,kazanda,süper meyve" "/saglik/galeri-,/saglik/video-"
amend bbc_turkce_saglik "BBC Haber leg: owner 2026-11-03 (science explainers and global health risks in, curiosity/celebrity out)" \
  "bilim,gerçekten,güvenli mi,faydalı mı,salgın,veba,radyasyon,kamp,hastalık,belirtileri,kanser,uyku,egzersiz,beslenme,depresyon,ruh sağlığı" "$PRESS_EX,papa,rusya,video oyunu,insan boyunun,nobel"
amend dha_saglik_yasam "DHA Haber leg: owner 2026-11-03 (named expert advice in, single patient stories and ministers out)" \
  "prof. dr,doç. dr,uzm. dr,op. dr,uzman,uyardı,çağrı,araştırma,aşı,salgın,kanser" "$PRESS_EX,kavuştu,yendi,ameliyattan,robotik cerrahi,akıllı bileklik,babasından,böbreklerini"
# --- TTB ---
B=https://www.ttb.org.tr/arsiv_haber.php
add ttb_meslek_haklari DUYURU "TTB - Meslek hakları (Haber)" $B "hekim,asistan,iş yükü,şiddet,güvenlik,sözleşme,yönetmelik,performans,katsayı,ücret,mecburi hizmet,çalışma hakkı,yürütmesi durduruldu" "$SOC_EX,dava açtı,dava açtık,khk,barış akademisyenleri,kutlu olsun" "TTB meslek hakları Haber leg (owner 2026-11-03)" "/haber_goster.php,/arsiv_haber.php"
add egitim_ttb EGITIM "TTB - Eğitim" $B "$EGITIM_IN,stE,akreditasyon,kredilendirme" "$SOC_EX,$DONE_EX" "TTB eğitim leg (owner 2026-11-03)" "/duyuru_goster.php,/arsiv_duyuru.php" yes
# --- HASUDER ---
H=https://www.hasuder.org.tr/listele/duyurular-hasuder-cat
add hasuder_duyuru DUYURU "HASUDER - Duyuru" $H "yeterlik,sınav,başvuru,sonuç bildirgesi,bildirge,kongre" "$SOC_EX,$DONE_EX" "HASUDER duyuru leg (owner 2026-11-03)" "/duyurular-hasuder-cat/detay/"
add hasuder_ozelgun DUYURU "HASUDER - Özel gün (Haber)" $H "$OZEL_IN" "$SOC_EX" "HASUDER özel gün leg (owner 2026-11-03)" "/duyurular-hasuder-cat/detay/"
# --- Türk Toraks ---
T=https://toraks.org.tr/haberler
add ttd_ozelgun DUYURU "TTD - Özel gün ve toplumsal sağlık (Haber)" $T "$OZEL_IN,maden,mesleksel,iklim,orman,tütün kontrolü,tütün" "$SOC_EX,basın bildirisi kutlu,gar,lgbt" "TTD özel gün + sağlık bağlı toplumsal bildiri leg (owner 2026-11-03)" "/haberler/"
add egitim_ttd EGITIM "TTD - Eğitim" $T "$EGITIM_IN,aşı,aşılama,pnömokok,rsv" "$SOC_EX,$DONE_EX" "TTD eğitim leg (owner 2026-11-03)" "/haberler/" yes
# --- KLİMİK (existing duyuru record: congress/symposium exclusion lifted by owner) ---
amend klimık_infectious_diseases "KLİMİK: owner 2026-11-03 lifted the congress/symposium exclusion (dated congress notice = strong accept, Duyuru)" \
  "kılavuz,konsensus,enfeksiyon,duyuru,rehber,antibiyotik,kongre,sempozyum" "sponsor,$DONE_EX" "" yes
K=https://www.klimik.org.tr/category/duyurular/
add egitim_klimik EGITIM "KLİMİK - Eğitim" $K "web konferans,video,eğitim programı,kurs,toplantı,webinar,workshop" "$SOC_EX,$DONE_EX,bülten" "KLİMİK eğitim leg (owner 2026-11-03)" "/20" yes
add klimik_ozelgun DUYURU "KLİMİK - Özel gün (Haber)" $K "günü,haftası,ayı,farkındalık,polio" "$SOC_EX,yaşında" "KLİMİK özel gün leg (owner 2026-11-03)" "/20"
# --- TKD ---
D=https://www.tkd.org.tr/duyurular
add egitim_tkd EGITIM "TKD - Eğitim" $D "webinar,toplantı,kongre,bilimsel toplantılar takvimi,takvimi,okul,eğitim" "$SOC_EX,$DONE_EX,pci club,genel kurul" "TKD eğitim leg (owner 2026-11-03)" "/duyuru/" yes
# --- TPD ---
P=https://psikiyatri.org.tr/haber-duyuru
add tpd_duyuru DUYURU "TPD - Duyuru" $P "yeterlik sınavı,uygulama sınavı,başvuru,kılavuz,sonuç" "$SOC_EX,$DONE_EX,taziye,kaybettik,genel kurul" "TPD duyuru leg (owner 2026-11-03)"
add egitim_tpd EGITIM "TPD - Eğitim" $P "kongre,temel asistan eğitimi,kurs,sempozyum,eğitim" "$SOC_EX,$DONE_EX,şubesi" "TPD eğitim leg (owner 2026-11-03)" "" yes
add tpd_ozelgun DUYURU "TPD - Özel gün (Haber)" $P "ruh sağlığı günü,günü,haftası,ayı,farkındalık" "$SOC_EX,gar,katliam,lgbt,epa,dayanışma mektubu" "TPD özel gün leg (owner 2026-11-03)"
# --- TDB (site is a React SPA; news only via https://api.tdb.org.tr/news JSON, expect ADAPTER_REQUIRED) ---
add tdb_duyuru DUYURU "TDB - Duyuru" https://tdb.org.tr/basin-odasi/haber-arsivi "atama kurası,kura ilanı,yönetmelik,yayımlandı,mevzuat,uzmanlık,kontenjan,dus" "$SOC_EX,$DONE_EX,dava açtık,protesto,tuk kararı,faiz,ing" "TDB duyuru leg (owner 2026-11-03)"
