// Node -> existing Python guards. Read-only: activation gates + S66 identity via tip_toplulugu_lifecycle_bridge.py,
// capacity via the UNCHANGED operator guard `tip_toplulugu_ops.py capacity` (exit 0 SAFE / 1 CAUTION / 2 BLOCK).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

let cachedPython;
export function pythonCmd() {
  if (cachedPython !== undefined) return cachedPython;
  for (const c of [process.env.GCOS_PYTHON, 'python3', 'python'].filter(Boolean)) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3/.test(`${r.stdout}${r.stderr}`)) return (cachedPython = c);
  }
  return (cachedPython = null);
}

function run(root, script, args, input) {
  const py = pythonCmd();
  if (!py) return { ok: false, error: 'PYTHON_UNAVAILABLE' };
  const r = spawnSync(py, [join(root, 'adapters', 'tip-toplulugu-radar', 'scripts', script), ...args], {
    cwd: join(root, 'adapters', 'tip-toplulugu-radar'),
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  const line = String(r.stdout || '').trim();
  try {
    return { ok: true, status: r.status, data: JSON.parse(line.slice(line.indexOf('{'))) };
  } catch {
    return { ok: false, status: r.status, error: (r.stderr || line || 'no output').split('\n').slice(-3).join(' | ') };
  }
}

export function pythonBridge(root) {
  return {
    gates(profile) {
      const r = run(root, 'tip_toplulugu_lifecycle_bridge.py', ['gates'], profile);
      return r.ok ? r.data : { computed: null, gates_ok: false, failures: [`BRIDGE_ERROR:${r.error}`] };
    },
    identity(candidate) {
      const r = run(root, 'tip_toplulugu_lifecycle_bridge.py', ['identity'], { source_id: candidate.source_id, url: candidate.url, heading: candidate.heading, lane: candidate.lane });
      return r.ok ? r.data : { violations: [{ domain: null, error: `BRIDGE_ERROR:${r.error}` }] };
    },
    capacity({ addCadence, history = [] }) {
      const args = ['capacity', '--add', '1', '--add-cadence', String(addCadence)];
      if (history.length) args.push('--history', ...history);
      const r = run(root, 'tip_toplulugu_ops.py', args);
      if (!r.ok) return { status: 'BLOCK', reasons: [`BLOCK: capacity guard unavailable (${r.error}) -- fail closed`], guard: 'tip_toplulugu_ops.py capacity' };
      return { ...r.data, guard: 'tip_toplulugu_ops.py capacity', exit: r.status };
    },
  };
}
