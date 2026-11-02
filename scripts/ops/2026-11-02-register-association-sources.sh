#!/usr/bin/env bash
# Owner-decided registration (2026-11-02, Bible 26.1 per-source PASS/FAIL interview) of Medikal Akademi, Sağlık Aktüel,
# TEMD, TUTD, TND and Güvenilir Gıda (Gıdada Doğru Bilgi). One source per lane per publisher; rules: docs/audits/2026-11-02-association-sources-audit.md.
# usage: bash scripts/ops/2026-11-02-register-association-sources.sh [--apply]
set -euo pipefail
APPLY="${1:-}"
export MSYS_NO_PATHCONV=1
# Owner rejects in every lane of every society: memorial/condolence notices and the sponsored webinar series.
SOC_EX="vefat,başsağlığı,acı kaybımız,anısına,endokrin akademi,webinar"
OZEL_IN="günü,haftası,ayı,farkındalık,kutlu olsun,bayram,anma"
EGITIM_IN="kongre,kurs,sempozyum,toplantı,workshop,masterclass,meeting,course,eğitim"
add() { # id heading name url include exclude reason [paths] [allow-congress]
  node scripts/source-lifecycle.mjs add "$4" --channel tip_toplulugu --heading "$2" --source-id "$1" --name "$3" \
    --include "$5" --exclude "$6" --shared-endpoint "$7" ${8:+--paths "$8"} ${9:+--allow-congress true} $APPLY 2>&1 | grep -E "^ADD|GATES|CANARY|QUESTION" | cut -c1-220 || true
}
# --- TEMD ---
T=https://www.temd.org.tr/duyurular
add temd_duyuru DUYURU "TEMD - Duyuru" $T "kılavuz,uzlaşı,rapor,yayınlandı,yayımlandı" "$SOC_EX,kongre,kurs,sempozyum" "TEMD duyuru leg (owner 2026-11-02)" "/duyurular,/haberler/"
add egitim_temd EGITIM "TEMD - Eğitim" $T "$EGITIM_IN" "$SOC_EX" "TEMD eğitim leg (owner 2026-11-02)" "/duyurular,/haberler/" yes
add temd_ozelgun DUYURU "TEMD - Özel gün (Haber)" $T "$OZEL_IN,basın bildirisi" "$SOC_EX" "TEMD özel gün leg (owner 2026-11-02)" "/duyurular,/haberler/"
# --- TUTD ---
H=https://www.tutd.org.tr/haberler
add tutd_duyuru DUYURU "TUTD - Duyuru" $H "yeterlilik,sınav,akreditasyon,adaylara" "$SOC_EX,anket,haftanın sorusu" "TUTD duyuru leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler"
add egitim_tutd EGITIM "TUTD - Eğitim" $H "$EGITIM_IN" "$SOC_EX" "TUTD eğitim leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler" yes
add tutd_uyku_yazilari DUYURU "TUTD - Uyku yazıları (Haber)" $H "uyku,melatonin,magnezyum,sirkadiyen,horlama,apne,uykusuzluk,rüya" "$SOC_EX,anket,haftanın sorusu,yeterlilik,bayram,kutlu olsun" "TUTD halka uyku yazıları leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler"
add tutd_ozelgun DUYURU "TUTD - Özel gün (Haber)" $H "$OZEL_IN" "$SOC_EX,anket,haftanın sorusu" "TUTD özel gün leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler"
# --- TND ---
N=https://noroloji.org.tr/haberler
add tnd_duyuru DUYURU "TND - Duyuru" $N "board,yeterlik,burs,ödül,başvuru,sınav,sertifika" "$SOC_EX,seçilmiştir" "TND duyuru leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler,/kongre"
add egitim_tnd EGITIM "TND - Eğitim" $N "$EGITIM_IN" "$SOC_EX" "TND eğitim leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler,/kongre" yes
add tnd_bilimsel DUYURU "TND - Bilimsel sonuç (Haber)" $N "patent,çalışma,araştırma,makale,yayın,tanı,tedavi,yapay zeka,klinik" "$SOC_EX,seçilmiştir,seçildi,kutlu olsun" "TND bilimsel sonuç leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler,/kongre"
add tnd_ozelgun DUYURU "TND - Özel gün (Haber)" $N "$OZEL_IN" "$SOC_EX,seçilmiştir" "TND özel gün leg (owner 2026-11-02)" "/haber/,/haberler,/etkinlik/,/etkinlikler,/kongre"
# --- Güvenilir Gıda (Gıdada Doğru Bilgi) ---
add guvenilirgida_dogru_bilgi DUYURU "Güvenilir Gıda - Gıdada Doğru Bilgi (Haber)" https://guvenilirgida.tarimorman.gov.tr/Haber/Arsiv/ "gıda,konserve,e kod,etiket,güvenli,besleyici,kontrol" "ihale,personel,atama" "Gıdada Doğru Bilgi (owner 2026-11-02)"
# --- Haber news RSS ---
add medikal_akademi DUYURU "Medikal Akademi (Haber)" https://www.medikalakademi.com.tr/feed/ "tedavi,hasta,klinik,çalışma,araştırma,kanser,onkoloji,ilaç,cihaz,onay,rehber,kılavuz,güncellen,günü,haftası,ayı,farkındalık" "geri ödeme,sponsorlu,advertorial,reklam,kampanya,kutlu olsun" "Medikal Akademi RSS (owner 2026-11-02)" "/"
add saglik_aktuel_bilimsel DUYURU "Sağlık Aktüel - Bilimsel gelişme (Haber)" https://www.saglikaktuel.com/rss/ "tedavi,klinik,çalışma,araştırma,bilim,kanser,tanı,ameliyat,hastalık,ilaç,aşı,gen,hücre" "bakan,ziyaret,açılış,protokol,imza,operasyon,gözaltı,tutuklandı,yatırım" "Sağlık Aktüel RSS (owner 2026-11-02)"
