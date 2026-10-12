import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CREDENTIAL_ALIASES } from './config.mjs';

const script = fileURLToPath(new URL('./credential-store.ps1', import.meta.url));
const targetName = alias => {
  if (!CREDENTIAL_ALIASES.includes(alias)) throw new Error('CREDENTIAL_ALIAS_NOT_ALLOWED');
  return `GCOS.OperatorBridge.${alias}`;
};

function invoke(mode, alias) {
  targetName(alias);
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'PATH']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', script,
    '-Mode', mode, '-Alias', alias,
  ], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 16 * 1024, env });
  if (result.error || result.signal) throw new Error('CREDENTIAL_STORE_UNAVAILABLE');
  return { status: result.status, stdout: result.stdout ?? '' };
}

export function createWindowsCredentialStore() {
  return Object.freeze({
    async status() {
      const entries = {};
      for (const alias of CREDENTIAL_ALIASES) {
        const result = invoke('Status', alias);
        entries[alias] = result.status === 0 && result.stdout.trim() === 'PRESENT';
      }
      return { backend: 'WINDOWS_CREDENTIAL_MANAGER', credentials: entries };
    },
    async get(alias) {
      const result = invoke('Read', alias);
      if (result.status === 4 && result.stdout.trim() === 'MISSING') return null;
      if (result.status !== 0) throw new Error('CREDENTIAL_UNAVAILABLE');
      const encoded = result.stdout.trim();
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('CREDENTIAL_READ_FAILED');
      const value = Buffer.from(encoded, 'base64').toString('utf8');
      if (!value || Buffer.byteLength(value, 'utf8') > 5000) throw new Error('CREDENTIAL_READ_FAILED');
      return value;
    },
  });
}

export function credentialEnrollmentCommand(alias) {
  targetName(alias);
  return `powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "${path.resolve(script)}" -Mode Enroll -Alias ${alias}`;
}
