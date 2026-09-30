# apps/hub — subsystem router

`index.html` is a ~100 KB single-file Hub UI. Do not read it whole: `grep -n "<function or element id>" apps/hub/index.html`, then read a ±60-line window.

Tests: `node apps/hub/<name>.test.mjs` (`route-counts`, `source-family`, `source-review-filter`).
Data next to it (`bible-config.json`, `controlled-vocabulary.json`, `burs-sources.json`, `egitim-sources.json`) is loaded by the UI/worker — change with care, not for context.
`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` here is GENERATED from `adapters/hekimler-radar/content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` by `node scripts/generate-hub-bible.mjs` (static-asset packaging needs a physical file). Never edit it; `production:check` fails on a stale or hand-edited copy. `00_TURK_TIP_CONTENT_OS_BIBLE_v3.md` is a public redirect stub to v4.
