# HSGM (runner_region=TR) — Türkiye çıkışlı çalıştırma

`hsgm.saglik.gov.tr` GitHub/Cloudflare çıkış IP'lerine TCP seviyesinde kapalı; Türkiye ağından ~3 sn'de açılır.
Aynı adaptör, aynı politika, aynı kimlik doğrulamalı ingest ve telemetri kullanılır. Kod değişikliği gerekmez.

## Seçenek 1 — Self-hosted GitHub runner (önerilen)
1. Türkiye'deki bir makinede (ev PC / küçük VPS) repo → Settings → Actions → Runners → New self-hosted runner.
   Etiketler: `self-hosted`, `tr`. Bu runner yalnızca `hekimler-tr-runner.yml` tarafından kullanılır.
2. Secret zaten repo secret'ı olarak var (`TIP_RADAR_INGEST_TOKEN`); makinede saklanmaz.
3. Actions → "Hekimler Türkiye-region runner" → Run workflow (`sources=tr-runner`). Günlük çalıştırmak için
   bu workflow'a `schedule` ekleyin (varsayılan olarak yalnızca elle tetiklenir: runner yoksa iş beklemede kalır).
4. Kaldırma: Runner sayfasında Remove; makinede `./config.sh remove --token <TOKEN>`.

## Seçenek 2 — Zamanlanmış yerel komut (Windows)
```powershell
$env:TIP_RADAR_INGEST_TOKEN = (Get-Content $HOME\.hekimler_token -Raw).Trim()   # dosya yalnızca sizde, repo dışı
python channels\tip-ogrencileri-platformu\scripts\hekimler_scheduled_run.py --sources tr-runner --report-dir $HOME\hekimler-report
```
Görev Zamanlayıcı'da günlük 07:17 (Türkiye saati) çalıştırın. Kaldırma: görevi silin, token dosyasını silin.

## Sağlık kontrolü ve alarm
- Başarı: `GET /api/hekimler/sources` içinde `hsgm_public_health` için `last_success_at` bugün.
- Başarısızlıkta betik çıkış kodu 1 verir; workflow kırmızı olur (GitHub e-posta bildirimi) ve rapor artifact'ı yazılır.
- Token'ı log'a yazmayın; betik yazmaz.

## Durum
Bu repoyu çalıştıran ortamdan Türkiye çıkışlı bir makineye erişim yoktur; runner'ın çalıştığı iddia edilmez.
Yerel dry-run kanıtı: 58 ayrıştırılan, 3 tarih dışı, 53 politika dışı, 2 uygun, en yeni kayıt 2026-07-25.

## Windows görevi betiği (2026-09-21)
`scripts/hekimler_hsgm_local_task.ps1`: `-Run [-DryRun]` (görevin çalıştırdığı), `-Install` (günlük 07:17, `StartWhenAvailable` = kaçırılan çalıştırma bir sonraki açılışta), `-Uninstall`.
Log: `$HOME\hekimler-report\hsgm-run.log`; hata: `HSGM-LAST-RUN-FAILED.txt` + `msg` bildirimi + çıkış kodu 1. Token `$HOME\.hekimler_token` dosyasında (repo dışı, oluşturmanız gerekir; betik yazdırmaz/loglamaz). GitHub tarafındaki `hekimler-tr-freshness.yml` 48 saatten eski başarıyı e-postayla bildirir.
Durum: token dosyası yok ve `.dev.vars` içindeki geliştirme değeri üretimde HTTP 401 alıyor; görev kurulmadı, gerçek ingest çalıştırılmadı.
