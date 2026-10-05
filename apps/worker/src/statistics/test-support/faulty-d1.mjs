// Test-only fault injection around any D1-like handle (works identically on the sqlite and real local D1 engines).
// A fault targets the next batch whose SQL matches `when`:
//   { kind: 'before' }                       — throw before the batch reaches the database (nothing written)
//   { kind: 'poison', beforeSql: /re/ }      — insert a failing statement before the first statement matching /re/ → the database rolls the whole batch back
//   { kind: 'after' }                        — let the batch COMMIT, then throw (response lost after a durable commit)
export function faultyD1(inner) {
  const faults = [];
  const log = [];
  const wrap = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => wrap(sql, a),
    first: () => inner.prepare(sql).bind(...args).first(),
    all: () => inner.prepare(sql).bind(...args).all(),
    run: () => inner.prepare(sql).bind(...args).run(),
  });
  return {
    prepare: (sql) => wrap(sql),
    inject(fault) {
      faults.push({ times: 1, ...fault });
    },
    get log() {
      return log;
    },
    async batch(stmts) {
      // `skip: n` lets the first n matching batches through (to hit the 2nd/3rd batch of a unit)
      const idx = faults.findIndex((f) => {
        if (f.when && !stmts.some((s) => f.when.test(s.sql))) return false;
        if ((f.skip ?? 0) > 0) {
          f.skip--;
          return false;
        }
        return true;
      });
      const fault = idx >= 0 ? faults[idx] : null;
      if (fault && --fault.times <= 0) faults.splice(idx, 1);
      const real = stmts.map((s) => inner.prepare(s.sql).bind(...s.args));
      if (fault?.kind === 'before') {
        log.push('before');
        throw new Error('INJECTED_FAULT_BEFORE_TRANSACTION');
      }
      if (fault?.kind === 'poison') {
        const at = real.findIndex((_, i) => fault.beforeSql.test(stmts[i].sql));
        real.splice(at < 0 ? real.length : at, 0, inner.prepare("SELECT json('INJECTED_FAULT')"));
        log.push(`poison@${at}`);
        return inner.batch(real);
      }
      const res = await inner.batch(real);
      if (fault?.kind === 'after') {
        log.push('after');
        throw new Error('INJECTED_FAULT_AFTER_COMMIT');
      }
      return res;
    },
  };
}
