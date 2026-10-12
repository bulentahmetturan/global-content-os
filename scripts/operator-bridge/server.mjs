import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWindowsCredentialStore } from './credentials.mjs';
import { createOperatorService } from './service.mjs';
import { createMcpHandler, parseStdioLine } from './protocol.mjs';

export async function runStdioServer({ input = process.stdin, output = process.stdout, operator = createOperatorService({ credentialStore: createWindowsCredentialStore() }) } = {}) {
  const handle = createMcpHandler(operator);
  const rl = readline.createInterface({ input, crlfDelay: Infinity, terminal: false });
  let queue = Promise.resolve();
  rl.on('line', line => {
    queue = queue.then(async () => {
      const message = parseStdioLine(line);
      const response = message.error ? (message.error.code === -32700 ? { jsonrpc: '2.0', id: null, error: message.error } : null) : await handle(message);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    }).catch(() => {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Operator bridge internal error' } })}\n`);
    });
  });
  await new Promise(resolve => rl.on('close', resolve));
  await queue;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runStdioServer().catch(() => process.exitCode = 1);
}
