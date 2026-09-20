/**
 * Isolated scheduled-job runner for Global Content OS Worker.
 * One job failure must not silence unrelated jobs (e.g. enrich vs Hekimler).
 */
export type ScheduledJobFn = () => Promise<unknown>;

export interface ScheduledJobSpec {
  id: string;
  run: ScheduledJobFn;
  /** When false, the job is skipped for this tick (still recorded as skipped). */
  enabled?: boolean;
}

export interface ScheduledJobResult {
  id: string;
  status: 'fulfilled' | 'rejected' | 'skipped';
  error?: {
    name: string;
    message: string;
  };
}

export interface ScheduledTickReport {
  ok: boolean;
  results: ScheduledJobResult[];
  failures: ScheduledJobResult[];
}

function structuredError(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name || 'Error', message: err.message };
  }
  return { name: 'Error', message: String(err) };
}

/**
 * Run jobs with Promise.allSettled so failures are isolated.
 * Rejected jobs are logged via `onError` (never swallowed) and returned in `failures`.
 */
export async function runIsolatedScheduledJobs(
  jobs: ScheduledJobSpec[],
  opts: { onError?: (result: ScheduledJobResult) => void } = {}
): Promise<ScheduledTickReport> {
  const prepared: Array<{ id: string; promise: Promise<unknown> | null; skipped: boolean }> = [];
  for (const job of jobs) {
    if (job.enabled === false) {
      prepared.push({ id: job.id, promise: null, skipped: true });
    } else {
      prepared.push({ id: job.id, promise: Promise.resolve().then(() => job.run()), skipped: false });
    }
  }

  const settled = await Promise.allSettled(
    prepared.map((p) => (p.skipped ? Promise.resolve(null) : (p.promise as Promise<unknown>)))
  );

  const results: ScheduledJobResult[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const meta = prepared[i];
    if (meta.skipped) {
      results.push({ id: meta.id, status: 'skipped' });
      continue;
    }
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results.push({ id: meta.id, status: 'fulfilled' });
    } else {
      const row: ScheduledJobResult = {
        id: meta.id,
        status: 'rejected',
        error: structuredError(outcome.reason),
      };
      results.push(row);
      opts.onError?.(row);
    }
  }

  const failures = results.filter((r) => r.status === 'rejected');
  return { ok: failures.length === 0, results, failures };
}
