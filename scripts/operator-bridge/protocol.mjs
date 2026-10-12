import { TOOL_NAMES } from './config.mjs';

const PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = Object.freeze({ name: 'gcos-local-operator-bridge', version: '1.0.0' });
const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';
const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';

export function createMcpHandler(operator) {
  return async message => {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return null;
    const hasId = Object.hasOwn(message, 'id');
    const isModern = message.params?._meta?.[PROTOCOL_VERSION_KEY] === PROTOCOL_VERSION;
    const result = value => hasId ? {
      jsonrpc: '2.0', id: message.id,
      result: isModern ? { ...value, _meta: { [SERVER_INFO_KEY]: SERVER_INFO } } : value,
    } : null;
    const error = (code, text) => hasId ? {
      jsonrpc: '2.0', id: message.id, error: { code, message: text },
      ...(isModern ? { _meta: { [SERVER_INFO_KEY]: SERVER_INFO } } : {}),
    } : null;

    if (message.method === 'server/discover') {
      if (!isModern) return error(-32022, 'Unsupported protocol version');
      return result({
        resultType: 'complete', supportedVersions: [PROTOCOL_VERSION],
        capabilities: { tools: {} },
        ttlMs: 300_000, cacheScope: 'private',
      });
    }
    if (message.method === 'initialize') {
      if (message.params?.protocolVersion !== LEGACY_PROTOCOL_VERSION) return error(-32602, 'Unsupported protocol version');
      return result({ protocolVersion: LEGACY_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
    }
    if (!isModern && message.method !== 'notifications/initialized' && message.method !== 'notifications/cancelled') {
      return error(-32022, 'Unsupported protocol version');
    }
    if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
    if (message.method === 'tools/list') {
      return result({ resultType: 'complete', tools: await operator.listTools(), ttlMs: 300_000, cacheScope: 'private' });
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      if (!TOOL_NAMES.includes(name)) return error(-32602, 'Unknown operator operation');
      const args = message.params?.arguments ?? {};
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 0) {
        return result({ resultType: 'complete', content: [{ type: 'text', text: JSON.stringify({ error: 'ARGUMENTS_NOT_ALLOWED' }) }], isError: true });
      }
      try {
        const output = await operator.call(name, args);
        return result({ resultType: 'complete', content: [{ type: 'text', text: JSON.stringify(output) }], isError: false });
      } catch (cause) {
        const code = typeof cause?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(cause.code) ? cause.code : 'OPERATOR_BRIDGE_FAILURE';
        return result({ resultType: 'complete', content: [{ type: 'text', text: JSON.stringify({ error: code }) }], isError: true });
      }
    }
    return error(-32601, 'Method not supported');
  };
}

export function parseStdioLine(line) {
  if (Buffer.byteLength(line, 'utf8') > 64 * 1024) return { error: { code: -32700, message: 'Message too large' } };
  try { return JSON.parse(line); }
  catch { return { error: { code: -32700, message: 'Invalid JSON' } }; }
}
