// Test-only: counts D1 traffic (calls vs statements) around any D1-like handle. A batch is ONE call carrying n statements.
export function recordingD1(inner) {
  const stats = { calls: 0, statements: 0, batches: 0, maxBatchStatements: 0, reads: 0, writes: 0 };
  const isWrite = (sql) => /^\s*(WITH|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
  const count = (sql) => {
    stats.statements++;
    if (isWrite(sql)) stats.writes++;
    else stats.reads++;
  };
  const wrap = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => wrap(sql, a),
    first: () => (stats.calls++, count(sql), inner.prepare(sql).bind(...args).first()),
    all: () => (stats.calls++, count(sql), inner.prepare(sql).bind(...args).all()),
    run: () => (stats.calls++, count(sql), inner.prepare(sql).bind(...args).run()),
  });
  return {
    prepare: (sql) => wrap(sql),
    async batch(stmts) {
      stats.calls++;
      stats.batches++;
      stats.maxBatchStatements = Math.max(stats.maxBatchStatements, stmts.length);
      stmts.forEach((s) => count(s.sql));
      return inner.batch(stmts.map((s) => inner.prepare(s.sql).bind(...s.args)));
    },
    stats,
    reset() {
      Object.keys(stats).forEach((k) => (stats[k] = 0));
    },
  };
}
