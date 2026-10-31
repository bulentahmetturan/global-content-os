#!/usr/bin/env bash
# HSGM (hsgm.saglik.gov.tr) registration, owner decision 2026-10-31: 10 daire pages x 3 per-lane legs
# (Duyuru, Eğitim, Haber özel gün), each through the canonical lifecycle (scripts/source-lifecycle.mjs).
# Rules: docs/audits/2026-10-31-hsgm-audit.md. Every source runs on the Türkiye-egress runner (runner_region TR).
# usage: bash scripts/ops/2026-10-31-register-hsgm.sh <run-report-dir> [--apply]
set -euo pipefail
HIST="${1:?run-report dir}"; APPLY="${2:-}"
BASE="https://hsgm.saglik.gov.tr/tr"
COMMON_EX="ziyaret,toplantı,sunum,açılış,protokol,imza,atama,personel,ihale,mali duyuru,sağlıklı hayat saat,tören,turnuva,çalıştay,bilgi güvenliği,oryantasyon,gerçekleştirildi,gerçekleştirilmiştir,tamamlandı,yapıldı,verildi"
OZEL_EX="günü,haftası,farkındalık"
DUYURU_IN="başvuru,kontenjan,usul ve esas,kesin liste,kabul,yerleştirme,sonuç,rehber,kılavuz,mevzuat kitab,güncellendi,güncellenmiştir,yayımlandı,yayımlanmıştır,yayınlandı,program,rapor,bülten,takvim,kod listesi"
DUYURU_EX="$COMMON_EX,$OZEL_EX,eğitim,kurs,sertifikalı eğitim"
EGITIM_IN="eğitim,kurs,kursiyer,sertifika,webinar"
EGITIM_EX="$COMMON_EX,$OZEL_EX"
HABER_IN="günü,haftası,ayı,farkındalık"
HABER_EX="$COMMON_EX"
# Areas the owner rejected (Mevzuat, kamuoyuna duyuru, ihale, basın odası) are fenced off in every leg.
FORBID="/tr/mevzuat,/tr/kamuoyuna-duyuru,/tr/ihale,/tr/basin-odasi"
# slug|page|name
PAGES=(
 "aile_hekimligi|haberler-1|Aile Hekimliği Eğitim ve İzleme"
 "asi|haberler-5|Aşı"
 "bulasici|haberler-12|Bulaşıcı Hastalıklar"
 "zoonotik|haberler-11|Zoonotik ve Vektörel Hastalıklar"
 "kadin_ureme|haberler-kadinuremesagligi|Kadın ve Üreme Sağlığı"
 "cocuk_ergen|haberler-cocukergen|Çocuk ve Ergen Sağlığı"
 "beslenme|haberler-6|Sağlıklı Beslenme"
 "toplum_sagligi|haberler-9|Toplum Sağlığı"
 "tuberkuloz|haberler-tbc|Tüberküloz"
 "mikrobiyoloji|haberler-10|Mikrobiyoloji"
)
for row in "${PAGES[@]}"; do
  IFS='|' read -r slug page label <<<"$row"
  for leg in duyuru egitim haber; do
    case $leg in
      duyuru) id="hsgm_$slug"; inc="$DUYURU_IN"; exc="$DUYURU_EX"; head=DUYURU; nm="HSGM $label - Duyuru";;
      egitim) id="egitim_hsgm_$slug"; inc="$EGITIM_IN"; exc="$EGITIM_EX"; head=EGITIM; nm="HSGM $label - Eğitim";;
      haber)  id="hsgm_${slug}_ozelgun"; inc="$HABER_IN"; exc="$HABER_EX"; head=DUYURU; nm="HSGM $label - Özel gün (Haber)";;
    esac
    node scripts/source-lifecycle.mjs add "$BASE/$page.html" --channel tip_toplulugu --heading "$head" --source-id "$id" --name "$nm" \
      --runner-region TR --forbid "$FORBID" --include "$inc" --exclude "$exc" --shared-endpoint "HSGM $label: $leg leg, owner per-lane policy 2026-10-31" \
      --history "$HIST" $APPLY 2>&1 | grep -E "^ADD|GATES" | cut -c1-200 || true
  done
done
