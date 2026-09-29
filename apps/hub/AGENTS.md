# apps/hub — subsystem router

`index.html` is a ~100 KB single-file Hub UI. Do not read it whole: `grep -n "<function or element id>" apps/hub/index.html`, then read a ±60-line window.

Tests: `node apps/hub/<name>.test.mjs` (`route-counts`, `source-family`, `source-review-filter`).
Data next to it (`bible-config.json`, `controlled-vocabulary.json`, `burs-sources.json`, `egitim-sources.json`) is loaded by the UI/worker — change with care, not for context.
The `00_TURK_TIP_*BIBLE*.md` files here are build copies of `adapters/hekimler-radar/content/`; edit the canonical one only (DEFERRED_BUILD_COPY).
