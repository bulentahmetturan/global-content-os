# T11 and T8 hardening preparation (2026-10-22)

Local and documentation work only. No production write, no deploy, no push, no tag created.

## T11. Standing procedure: source-onboarding dry run

Purpose: before any source is added, retired, reactivated or recalibrated, run the lifecycle orchestrator in dry-run mode and read the gates. Without `--apply` nothing is written (D1, files, or remote).

```
node scripts/source-lifecycle.mjs plan "<name or url>" [--url <official feed/page URL>] --json
```

Observed behavior (dry run executed 2026-10-22 with `plan "WHO News" --url https://www.who.int/rss-feeds/news-english.xml --json`):
- Exit 0, `outcome: NEEDS_USER_DECISION`, `reason: IDENTITY_AMBIGUOUS`, gates `REQUEST=PASS`, `IDENTITY=NEEDS_USER_DECISION`.
- The name matched 4 registered sources (two active in `kaduse-news`, two inactive in `tip_toplulugu`); the orchestrator asked for an exact `source_id` or official URL instead of guessing.
- Only a trace file was written: `.logs/source-lifecycle/slr_<id>.json` (git-ignored). Working tree stayed clean.

Procedure:
1. Run `plan` with the official URL. If `NEEDS_USER_DECISION`, give the exact `source_id` or URL and rerun. Never pick a candidate by guess.
2. Read the gates G0 to G10, endpoint, route, cadence, capacity, canary. A `BLOCKED_*` outcome (exit 4) stops the process; fix access/capacity first.
3. Exit codes: 0 ok, 3 needs a user decision, 4 blocked, 1 error or denied, 2 usage.
4. `--apply` writes the migration/D1 plan files locally. Remote D1 apply and any deploy remain owner-executed, with explicit authorization per source. The orchestrator itself states "remote apply needs explicit authorization".
5. After an owner-applied onboarding: run `node scripts/health-watch.mjs` (expect OK) and record the result in the audit trail.

Companion commands, all dry-run safe: `inspect`, `purge-plan`. `retire`, `reactivate`, `recalibrate` are dry runs unless `--apply` is given.

## T8. Single release line: current facts

| Fact | Value |
|---|---|
| Deploy source branch | `integration/gcos-gate-b-option4-20261015`, HEAD `e4f457f` (368 commits) |
| RC branch `integration/gcos-final-rc-20261014` | merge-base with HEAD is `3fc687e`; it has one commit HEAD lacks by hash (`8f5c985` short probe launcher). `git cherry` marks it patch-equivalent (`-`), so its content is already in HEAD |
| `integration/gcos-critical-path-20261014` | 0 commits ahead of HEAD (fully contained) |
| `integration/secure-windows-operator-broker-20261013` | 22 commits ahead of HEAD; broker lineage, intentionally separate, not deployed with the Worker |
| Tags | none for GCOS release; existing tags are older (`system-v1-*`, `r2-integrated-*`) |
| Remote | `origin` = `github.com/bulentahmetturan/global-content-os` |
| Live Worker | version `c204adee` (code `435ed217`, module hash verified in the deployment record) |

Conclusion: the deployed line is a superset of the RC and critical-path branches. One line already exists in practice; it only lacks a name and a tag.

Proposed steps (none executed; each is owner-authorized):
1. After 31/31 is published: create an annotated tag on the final docs commit, for example `gcos-live-100-20261022`. Local, harmless, reversible.
2. Push the branch and the tag to `origin` (owner executes; publishes the history).
3. Open one PR `integration/gcos-gate-b-option4-20261015` into the main branch, containing the Gate B exception record, the Dossier fix and the evidence docs. Merge only on the owner's decision; do not auto-merge.
4. Leave the broker branch separate until the owner decides on the optional broker update (T10).
5. Do not delete or rewrite any other branch or worktree (`gcos-final-rc`, `gcos-gate-b-supersede`, `gcos-central-recovery`, `gcos-doctors-integration` are preserved).

Not done now on purpose: the 100% report is still waiting on the Dossier run, and the tag should name the final commit.
