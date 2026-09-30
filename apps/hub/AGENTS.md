# apps/hub — subsystem router

`index.html` is a ~100 KB single-file Hub UI. Do not read it whole: `grep -n "<function or element id>" apps/hub/index.html`, then read a ±60-line window.

Tests: `node apps/hub/<name>.test.mjs` (`route-counts`, `source-family`, `source-review-filter`).
GENERATED here (static-asset packaging needs physical files; never edit, `production:check` fails on a stale or hand-edited copy): `00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`, `bible-config.json`, `controlled-vocabulary.json` (copies) and `burs-sources.json`, `egitim-sources.json` (catalogs projected from `source-registry-{burs,egitim}-v1.json`), all from `adapters/tip-toplulugu-radar/content/` by `node scripts/generate-hub-assets.mjs`. Edit the canonical file, then regenerate. `SOURCE_LABELS` / `SOURCE_WHY` in `index.html` are Hub display text, not source truth. The Bible is v4 only (Hub `/?route=bible`); the old v3 redirect stub was removed (D-UD-BATCH-3 UD-1).
