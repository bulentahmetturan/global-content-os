import { createWindowsCredentialStore } from './credentials.mjs';
import { createOperatorService } from './service.mjs';
import { TOOL_NAMES } from './config.mjs';

const [operation, ...args] = process.argv.slice(2);
if (!operation || !TOOL_NAMES.includes(operation) || args.length) {
  process.stderr.write(`Usage: node scripts/operator-bridge/cli.mjs <${TOOL_NAMES.join('|')}>\n`);
  process.exitCode = 2;
} else {
  try {
    const service = createOperatorService({ credentialStore: createWindowsCredentialStore() });
    const result = await service.call(operation, {});
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${/^[A-Z0-9_]{1,80}$/.test(error?.code ?? '') ? error.code : 'OPERATOR_BRIDGE_FAILURE'}\n`);
    process.exitCode = 1;
  }
}
