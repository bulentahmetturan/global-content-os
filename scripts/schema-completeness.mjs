// Local release verification only. No Worker import, network, credentials or table scans.
export function verifySchema(db, requiredNames, capabilities) {
  const applied=new Set(db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(r=>r.name));
  const missingMigrations=requiredNames.filter(name=>!applied.has(name));
  const missingCapabilities=[];
  for(const [table,columns] of Object.entries(capabilities)) {
    const present=new Set(db.prepare(`PRAGMA table_info("${table.replaceAll('"','""')}")`).all().map(r=>r.name));
    if(!present.size) missingCapabilities.push(table);
    else for(const column of columns) if(!present.has(column)) missingCapabilities.push(`${table}.${column}`);
  }
  return {verdict:missingMigrations.length || missingCapabilities.length?'BLOCKED':'READY',missingMigrations,missingCapabilities};
}
export const CONTENT_CAPABILITIES={
  Doctors:{actors:['actor_id'],doctor_candidates:['candidate_id'],doctor_source_proposals:['proposal_id'],doctor_profile_facts:['fact_id'],doctor_publications:['publication_id'],doctor_statements:['statement_id']},
  Discovery:{discovery_runs:['run_id'],candidate_ledger:['candidate_id'],onboarding_intents:['intent_id']},
  Protocols:{protocols:['protocol_id'],protocol_versions:['version_id'],protocol_claims:['claim_id'],protocol_ingestion_runs:['run_id']},
  Dossier:{dossier_control:['control_key'],dossier_candidates:['candidate_id'],dossier_canary_runs:['run_id']},
};
export const STATISTICS_CAPABILITIES={statistics_sources:['source_id'],statistics_ingestion_runs:['run_id'],statistics_current_observations:[]};
