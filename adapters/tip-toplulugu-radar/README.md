# Tıp Topluluğu radar (Global Content OS)

Python kaynak izleme. Marka/logo Design OS’ta kalır.

**Anayasa:** [`content/Global_Content_OS_Bible_v5.md`](content/Global_Content_OS_Bible_v5.md)

| Path | Rol |
|------|------|
| `radar/` | Fetch / gates / continuous runner |
| `content/Global_Content_OS_Bible_v5.md` | Bible v4 (Kitap I + Source Pass/Fail) |
| `content/taxonomy/` | Kontrollü sözlük |
| `content/config/` | Cadence, skor, eşik |
| `content/policies/` | Kategori kilit JSON |
| `content/source-registry-*.json` | Kaynak kayıtları |
| `tests/` | Pipeline testleri |
| `../tip-radar/` | LEGACY local push helper (see its README) |

Hub beş primary category: Haber, Burs, Eğitim, Duyuru, Research. Bible bir kategori değildir.

Burs/Eğitim: `MANUAL_INTAKE`, `auto_publish=false`. Gelen kutu kaynak listesi değildir. Source ≠ content ≠ opportunity.
