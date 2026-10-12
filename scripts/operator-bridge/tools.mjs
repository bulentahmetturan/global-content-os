import { TOOL_NAMES } from './config.mjs';

const descriptions = {
  operator_credential_status: 'Report presence only for the three named Windows Credential Manager aliases. Never returns credential values.',
  cloudflare_worker_versions: 'List at most 20 GCOS production Worker version metadata records using the fixed Cloudflare account and script.',
  cloudflare_active_worker_metadata: 'Read and bracket the active GCOS Worker deployment and sanitized version/binding metadata.',
  cloudflare_rollback_evidence: 'Inspect the known previous GCOS version metadata. Does not retrieve executable source or execute rollback.',
  gcos_ops_summary: 'Read the fixed GCOS OPS summary endpoint with the separate GCOS application read credential.',
  dossier_ops_summary: 'Read the fixed Dossier OPS summary endpoint with the separate Dossier read credential.',
  dossier_alerts: 'Read bounded Dossier alert metadata.',
  dossier_audit: 'Read the fixed Dossier audit endpoint, limited to 20 rows and redacted.',
  dossier_runs: 'Read the fixed Dossier runs endpoint, limited to 20 rows and redacted.',
};

export const TOOLS = Object.freeze(TOOL_NAMES.map(name => Object.freeze({
  name,
  description: descriptions[name],
  inputSchema: Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false }),
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
})));
