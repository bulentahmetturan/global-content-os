#!/usr/bin/env node
/**
 * Thin Node wrapper so `pnpm ingest:tip` works without activating a venv.
 * Delegates to push_to_hub.py (stdlib sqlite3).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'push_to_hub.py');
const result = spawnSync('python', [script, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
