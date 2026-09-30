/**
 * Isolated scheduled-job runner for Global Content OS Worker.
 * One job failure must not silence unrelated jobs (e.g. enrich vs Tıp Topluluğu).
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

export type ScheduledSlot =
  | 'who-news'
  | 'europe-pmc'
  | 'pubmed'
  | 'research-apis'
  | 'journal-fallback'
  | 'purge-trash'
  | 'news-generic'
  | 'research-generic'
  | 'enrich'
  | 'tip-toplulugu-continuous';

const HOURLY_INGEST: ScheduledSlot[] = ['who-news', 'europe-pmc', 'pubmed', 'research-apis', 'journal-fallback'];
const MINUTE_ROTATION: ScheduledSlot[] = [
  'news-generic',
  'research-generic',
  'enrich',
  'news-generic',
  'research-generic',
  'tip-toplulugu-continuous',
];

/**
 * One job per cron tick. Workers Free allows 10 ms CPU per invocation; running every job in parallel each
 * minute (feed fetch + parse for 14 feeds, enrichment, Tıp Topluluğu tick) exceeded it on ~90% of ticks, so the
 * invocation was killed mid-flight. Rotating keeps every job on a schedule while each tick stays small.
 */
export function pickScheduledSlot(hour: number, minute: number): ScheduledSlot {
  if (minute % 15 === 0) return HOURLY_INGEST[(hour * 4 + minute / 15) % HOURLY_INGEST.length];
  if (minute === 7 || minute === 37) return 'purge-trash';
  return MINUTE_ROTATION[minute % MINUTE_ROTATION.length];
}

/**
 * Batch start for the journal Crossref fallback. The slot runs on only one in every HOURLY_INGEST.length
 * quarter hours, so the batch must advance per run of the slot: a per-quarter-hour formula
 * (`floor(dayMinute / 15) * 5 % 25`) lands on the same batch every run and starved journals 0-19
 * (2026-09-22 .. 2026-09-30). Every journal is visited once per ceil(total / limit) runs.
 */
export function journalFallbackOffset(hour: number, minute: number, total: number, limit: number): number {
  const run = Math.floor((hour * 4 + Math.floor(minute / 15)) / HOURLY_INGEST.length);
  const batches = Math.max(1, Math.ceil(total / limit));
  return (run % batches) * limit;
}
