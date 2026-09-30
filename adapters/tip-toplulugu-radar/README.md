# Tıp Topluluğu radar (Global Content OS)

Python kaynak izleme. Marka/logo Design OS’ta kalır.

**Anayasa:** [`content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`](content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md)

| Path | Rol |
|------|------|
| `radar/` | Fetch / gates / continuous runner |
| `content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` | Bible v4 (Kitap I + Source Pass/Fail) |
| `content/taxonomy/` | Kontrollü sözlük |
| `content/config/` | Cadence, skor, eşik |
| `content/policies/` | Kategori kilit JSON |
| `content/source-registry-*.json` | Kaynak kayıtları |
| `tests/` | Pipeline testleri |
| `../tip-radar/` | LEGACY local push helper (see its README) |

Hub beş primary category: Haber, Burs, Eğitim, Duyuru, Research. Bible bir kategori değildir.

Burs/Eğitim: `MANUAL_INTAKE`, `auto_publish=false`. Gelen kutu kaynak listesi değildir. Source ≠ content ≠ opportunity.
