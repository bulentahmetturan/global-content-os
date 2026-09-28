# İçerik belgeler — harita

Tek bağlayıcı anayasa:

- [`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`](00_TURK_TIP_CONTENT_OS_BIBLE_v4.md) (Hub: `/?route=bible`)

Bible ile çelişen MD yok sayılır. İkinci bible yazılmaz.

## Yaşayan katmanlar (Bible §33)

| Katman | Nerede |
|---|---|
| Bible | `00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` |
| Controlled vocabulary | `taxonomy/controlled-vocabulary.json` |
| Config | `config/bible-config.json` |
| Source registry | `source-registry-*.json` |
| Opportunity pool | `burs/pool.json`, `egitim/pool.json` |
| Policies | `policies/*.json` |
| Problem MD | `SORUN-TESPIT-LISTESI.md` |

## Hub kategorileri (Bible §2)

`haber` · `burs` · `egitim` · `duyuru` · `research`

Beş kategori için ayrı işletim MD’si **henüz yok**; birlikte yazılacak.

## Registry yük sırası

phase1 → v1.1 → abroad → batch2 → batch3 → burs → eğitim. `hekimler_integrity.py` çözer. Yeni `burs_*` / `egitim_*` önceki kimliği ezmez.

## Arşiv

[`archive/`](archive/) — 2026-09 checkpoint notları; bağlayıcı değil.
