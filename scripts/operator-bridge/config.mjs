export const TARGET = Object.freeze({
  accountId: '92fd1fe2237154079a0834121c33964b',
  workerName: 'global-content-os',
  environment: 'production',
  liveVersionId: 'e1f82b14-95be-4041-8a20-fd4b7f468b0c',
  rollbackVersionId: '2a1876d4-2cbb-4c18-9125-10699dba7d3a',
  appOrigin: 'https://global-content-os.channel-content-os-mcp.workers.dev',
});

export const CREDENTIAL_ALIASES = Object.freeze([
  'CLOUDFLARE_READ',
  'GCOS_OPS_READ',
  'DOSSIER_OPS_READ',
]);

export const APPLICATION_READS = Object.freeze({
  gcos_ops_summary: { alias: 'GCOS_OPS_READ', path: '/api/ops/summary' },
  dossier_ops_summary: { alias: 'DOSSIER_OPS_READ', path: '/api/dossier/ops/summary' },
  dossier_alerts: { alias: 'DOSSIER_OPS_READ', path: '/api/dossier/ops/alerts' },
  dossier_audit: { alias: 'DOSSIER_OPS_READ', path: '/api/dossier/ops/audit?limit=20' },
  dossier_runs: { alias: 'DOSSIER_OPS_READ', path: '/api/dossier/ops/runs?limit=20' },
});

export const TOOL_NAMES = Object.freeze([
  'operator_credential_status',
  'cloudflare_worker_versions',
  'cloudflare_active_worker_metadata',
  'cloudflare_rollback_evidence',
  ...Object.keys(APPLICATION_READS),
]);
