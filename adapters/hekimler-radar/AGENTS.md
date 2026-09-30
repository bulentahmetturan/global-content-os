# hekimler-radar — subsystem router

Python source monitoring for the Hekimler Topluluğu channel (Turkish health professionals/students). Runtime lives here; brand/channel editorial policy is owned by the channel repo.

Scope gate: strict physician / dentist / vet / student / abroad-scholarship scope. KPSS-type and other out-of-scope items never enter the pipeline. Foreign local regulations/discipline news are out; scholarships and education for Turkish candidates are in. Editorial mission: `content/SORUN-TESPIT-LISTESI.md:1-98`.

## Read
- Bible task → `content/BIBLE-INDEX.md` (read the listed range, never the whole 2181-line Bible).
- Source → grep one id in `content/source-registry-*.json`; registry load order is in `content/README.md`.
- Bible edit: change only `content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`, then regenerate the Hub copies from the repo root with `node scripts/generate-hub-assets.mjs` (also after editing `adapters/hekimler-radar/content/config/bible-config.json`, `adapters/hekimler-radar/content/taxonomy/controlled-vocabulary.json` or the burs/egitim registries).
- Code map: `radar/` fetch, gates, lifecycle, continuous runner; `scripts/` operators; `tests/` mirrors `radar/`.

## Do not load
`sources/_*` probe dumps, `content/archive/`, `content/legacy-cleanup/`, `tests/fixtures/`, `content/PIPELINE-STATUS-46.json`, `content/00_TURK_TIP_CONTENT_OS_BIBLE_v3.md`, `content/SORUN-TESPIT-LISTESI.md` after line 98.

## Test
From this directory: `python scripts/run_hekimler_tests.py` (canonical suite). Run the single relevant `tests/test_hekimler_*.py` first; write full output to `.logs/`.
