# hekimler-radar — subsystem router

Python source monitoring for the Hekimler Topluluğu channel (Turkish health professionals/students). Runtime lives here; brand/channel editorial policy is owned by the channel repo.

Scope gate: strict physician / dentist / vet / student / abroad-scholarship scope. KPSS-type and other out-of-scope items never enter the pipeline. Foreign local regulations/discipline news are out; scholarships and education for Turkish candidates are in. Editorial mission: `content/SORUN-TESPIT-LISTESI.md:1-98`.

## Read
- Bible task → `content/BIBLE-INDEX.md` (read the listed range, never the whole 2181-line Bible).
- Source → grep one id in `content/source-registry-*.json`; registry load order is in `content/README.md`.
- Code map: `radar/` fetch, gates, lifecycle, continuous runner; `scripts/` operators; `tests/` mirrors `radar/`.

## Do not load
`sources/_*` probe dumps, `content/archive/`, `content/legacy-cleanup/`, `tests/fixtures/`, `content/PIPELINE-STATUS-46.json`, `content/00_TURK_TIP_CONTENT_OS_BIBLE_v3.md`, `content/_bible_v4_book2.md` (assembly input), `content/SORUN-TESPIT-LISTESI.md` after line 98.

## Test
From this directory: `python scripts/run_hekimler_tests.py` (canonical suite). Run the single relevant `tests/test_hekimler_*.py` first; write full output to `.logs/`.
