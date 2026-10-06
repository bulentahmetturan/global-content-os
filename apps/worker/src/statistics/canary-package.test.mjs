// The first-canary package (docs + command list + owner SQL) stays consistent with the code and with the frozen governance rules. Local only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pkg = JSON.parse(readFileSync('docs/generated/statistics-first-canary-package-v1.json', 'utf8'));
const cmds = JSON.parse(readFileSync('release/statistics-canary-commands.json', 'utf8'));
const code = readFileSync('apps/worker/src/statistics/canary-budget.ts', 'utf8') + readFileSync('apps/worker/src/statistics/canary-routes.ts', 'utf8');

describe('first canary package', () => {
  it('budget numbers in the package equal the code constants', () => {
    assert.match(code, /softCalls: 40, hardStopCalls: 44, maxStatements: 160/);
    assert.deepEqual([pkg.item_47_d1_budget_hard_stop.soft_calls, pkg.item_47_d1_budget_hard_stop.hard_stop_calls, pkg.item_47_d1_budget_hard_stop.max_statements], [40, 44, 160]);
    assert.match(code, /sourceRequestLimit: 3/);
    assert.match(code, /operatorInvocationLimit: 3/);
    const b = pkg.item_47_d1_budget_hard_stop;
    assert.deepEqual([b.TARGET_D1_CALL_BUDGET, b.D1_CALL_HARD_STOP, b.CONSERVATIVE_D1_CALL_LIMIT, b.D1_STATEMENT_REFERENCE], [40, 44, 50, 149]);
    const m = b.measured_whole_invocation;
    for (const phase of [m.A_CANARY_RUN, m.B_POST_CANARY_PRODUCTION_HANDOFF_RUN]) assert.ok(phase.calls <= 40 && phase.statements <= 160, JSON.stringify(phase));
    assert.deepEqual([m.C_combined_owner_workflow.TOTAL_D1_CALLS, m.C_combined_owner_workflow.TOTAL_D1_STATEMENTS], [m.A_CANARY_RUN.calls + m.B_POST_CANARY_PRODUCTION_HANDOFF_RUN.calls, m.A_CANARY_RUN.statements + m.B_POST_CANARY_PRODUCTION_HANDOFF_RUN.statements]);
    assert.equal(b.handoff_source_requests.MAX_HANDOFF_SOURCE_REQUESTS, 1);
    assert.match(code, /handoffSourceRequestLimit: 1/);
    assert.match(b.BATCH_COUNTING, /UNRESOLVED/);
    assert.equal(b.ACCOUNT_TIER_FOR_STATS, 'UNKNOWN');
  });
  it('the slice is the frozen 27-observation canary and never lastTimePeriod', () => {
    assert.deepEqual(pkg.item_46_exact_slice.geos, ['DE', 'EU27_2020', 'TR']);
    assert.ok(!pkg.item_46_exact_slice.request_url.includes('lastTimePeriod'));
    assert.equal(pkg.item_46_exact_slice.expected.observations, 27);
  });
  it('every mutating command needs its own approval key; read-only ones need none; nothing pushes or merges; no secrets', () => {
    const keys = new Set();
    for (const c of cmds.commands) {
      if (c.mutates) {
        assert.match(c.approval_key, /^OWNER_APPROVAL_[A-Z_]+$/, c.id);
        assert.ok(!keys.has(c.approval_key), `${c.id} reuses an approval key`);
        keys.add(c.approval_key);
        assert.ok(c.rollback && c.rollback !== 'none', `${c.id} needs a rollback`);
      } else assert.equal(c.approval_key, null, c.id);
      assert.doesNotMatch(JSON.stringify(c), /git push|git merge|--force|Bearer [A-Za-z0-9]|OPS_TOKEN=[A-Za-z0-9]/i, c.id);
    }
    assert.ok(cmds.stop_rules.length >= 5);
  });
  it('the Worker never writes policy: arming is owner SQL that can only reach ACTIVATION_GATED, disarm only DISABLED', () => {
    const arm = readFileSync('release/statistics-canary-policy-arm.sql', 'utf8');
    const disarm = readFileSync('release/statistics-canary-policy-disarm.sql', 'utf8');
    assert.doesNotMatch(arm.replace(/^--.*$/gm, ''), /'ACTIVE'/);
    assert.match(arm, /ACTIVATION_GATED/);
    assert.match(disarm, /runtime_state = 'DISABLED'/);
    assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /policy\.(update|ensureDefault)/);
  });
  it('the dormant state is real: wrangler.toml carries the reviewed STATS_DB binding with the switch OFF, index.ts wires the canary routes, and the package says NOT_EXECUTED', () => {
    const toml = readFileSync('wrangler.toml', 'utf8');
    assert.match(toml, /binding = "STATS_DB"/);
    assert.match(toml, /database_name = "global-content-os-stats"/);
    assert.match(toml, /STATISTICS_CANARY_ENABLED = "false"/);
    assert.match(readFileSync('apps/worker/src/index.ts', 'utf8'), /statistics\/statistics-routes/);
    assert.match(pkg.status, /NOT_EXECUTED/);
    assert.equal(pkg.FIRST_HEALTH_STATISTICS_CANARY_PACKAGE, 'FROZEN_V1');
    assert.equal(pkg.O2_REQUIRES_SCHEMA_CHANGE, 'NO');
    for (const i of ['45', '46', '47', '48', '49', '50', '51', '52', '59']) assert.equal(pkg.master_checklist_disposition[i].split(' ')[0], 'READY_LOCAL', i);
    assert.equal(pkg.projection_handoff.CANARY_RELEASE_MUTATED, 'NO');
    assert.equal(pkg.item_52_owner_authorization.status, 'UNSIGNED');
  });
});

describe('canonical run model and implementation count', () => {
  it('one logical run, 3 operator invocations (CLI counter), no automatic second run, exactly one canary implementation file set', async () => {
    assert.equal(pkg.run_model.ONE_LOGICAL_CANARY_RUN, 'REQUIRED');
    assert.equal(pkg.run_model.MAX_OPERATOR_INVOCATIONS, 3);
    assert.equal(pkg.run_model.AUTOMATIC_SECOND_LOGICAL_RUN, 'FORBIDDEN');
    assert.equal(pkg.run_model.POST_CANARY_PRODUCTION_HANDOFF_RUN, 'OWNER_TRIGGERED_ONLY');
    assert.equal(pkg.run_model.AUTOMATIC_SECOND_CANARY_RUN, 'FORBIDDEN');
    assert.equal(pkg.canonical_implementation.count, 1);
    assert.match(code, /maxLogicalRuns: 1/);
    const { MAX_RUN_INVOCATIONS } = await import('../../../../scripts/statistics-canary-operator.mjs');
    assert.equal(MAX_RUN_INVOCATIONS, 3);
    const { readdirSync } = await import('node:fs');
    const canaryModules = readdirSync('apps/worker/src/statistics').filter((f) => /^canary.*\.ts$/.test(f)).sort();
    assert.deepEqual(canaryModules, ['canary-budget.ts', 'canary-routes.ts'], 'no competing canary module in the source tree');
    for (const id of ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S9b', 'S9c', 'S9d', 'S10']) assert.ok(cmds.commands.some((c) => c.id === id), id);
  });
  it('the CLI invocation counter refuses the 4th run attempt', async () => {
    const { reserveInvocation } = await import('../../../../scripts/statistics-canary-operator.mjs');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const f = join(mkdtempSync(join(tmpdir(), 'inv-')), 'n.json');
    assert.deepEqual([reserveInvocation(f), reserveInvocation(f), reserveInvocation(f)], [1, 2, 3]);
    assert.throws(() => reserveInvocation(f), /MAX_OPERATOR_INVOCATIONS=3/);
  });
});
