import { newId } from '../db/queries';

// Doctor knowledge (LOCAL ONLY): publications/events and doctor-origin
// statements. Profile identity stays in actors/actor_aliases; this module
// records appearances and statements with source attribution. Statements
// carry an evidence status but are never validated medical fact.

export const PUBLICATION_KINDS = [
  'ARTICLE', 'RESEARCH_PAPER', 'INTERVIEW', 'PUBLIC_STATEMENT',
  'VIDEO', 'EVENT', 'OTHER',
] as const;

export const STATEMENT_CLASSES = [
  'HEALTH_CLAIM', 'CLINICAL_RECOMMENDATION', 'PROTOCOL_REFERENCE', 'GENERAL',
] as const;

export const STATEMENT_EVIDENCE_STATUSES = [
  'UNKNOWN', 'UNVERIFIED', 'CONTESTED', 'SUPERSEDED',
] as const;

export interface DoctorPublication {
  publication_id: string;
  actor_id: string;
  kind: string;
  title: string;
  publisher: string | null;
  published_at: string | null;
  canonical_url: string | null;
  source_item_id: string | null;
}

export interface DoctorStatement {
  statement_id: string;
  actor_id: string;
  publication_id: string | null;
  statement_text: string;
  statement_class: string;
  evidence_status: string;
}

function assertEnum(value: string, allowed: readonly string[], field: string): string {
  if (!allowed.includes(value)) throw new Error(`DOCTOR_KNOWLEDGE_INVALID: ${field} must be one of ${allowed.join('/')}`);
  return value;
}

export async function recordPublication(
  db: D1Database,
  input: {
    actorId: string;
    kind: string;
    title: string;
    publisher?: string | null;
    publishedAt?: string | null;
    canonicalUrl?: string | null;
    sourceItemId?: string | null;
  },
): Promise<DoctorPublication> {
  if (!input.title?.trim()) throw new Error('DOCTOR_KNOWLEDGE_INVALID: title is required');
  assertEnum(input.kind, PUBLICATION_KINDS, 'kind');
  const actor = await db.prepare('SELECT actor_id FROM actors WHERE actor_id = ?')
    .bind(input.actorId).first<{ actor_id: string }>();
  if (!actor) throw new Error('DOCTOR_KNOWLEDGE_UNKNOWN_ACTOR');
  if (input.canonicalUrl) {
    const prior = await db.prepare(
      'SELECT * FROM doctor_publications WHERE actor_id = ? AND canonical_url = ?',
    ).bind(input.actorId, input.canonicalUrl).first<DoctorPublication>();
    if (prior) return prior;
  }
  const row: DoctorPublication = {
    publication_id: newId('publication'),
    actor_id: input.actorId,
    kind: input.kind,
    title: input.title.trim(),
    publisher: input.publisher ?? null,
    published_at: input.publishedAt ?? null,
    canonical_url: input.canonicalUrl ?? null,
    source_item_id: input.sourceItemId ?? null,
  };
  await db.prepare(
    `INSERT INTO doctor_publications
      (publication_id, actor_id, kind, title, publisher, published_at, canonical_url, source_item_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(row.publication_id, row.actor_id, row.kind, row.title, row.publisher, row.published_at, row.canonical_url, row.source_item_id).run();
  return row;
}

export async function recordStatement(
  db: D1Database,
  input: {
    actorId: string;
    publicationId?: string | null;
    statementText: string;
    statementClass: string;
    evidenceStatus?: string;
    extractedAt: string;
    supersedesId?: string | null;
  },
): Promise<DoctorStatement> {
  if (!input.statementText?.trim()) throw new Error('DOCTOR_KNOWLEDGE_INVALID: statement_text is required');
  assertEnum(input.statementClass, STATEMENT_CLASSES, 'statement_class');
  const evidenceStatus = input.evidenceStatus ?? 'UNKNOWN';
  assertEnum(evidenceStatus, STATEMENT_EVIDENCE_STATUSES, 'evidence_status');
  const actor = await db.prepare('SELECT actor_id FROM actors WHERE actor_id = ?')
    .bind(input.actorId).first<{ actor_id: string }>();
  if (!actor) throw new Error('DOCTOR_KNOWLEDGE_UNKNOWN_ACTOR');
  if (input.publicationId) {
    const publication = await db.prepare('SELECT publication_id, actor_id FROM doctor_publications WHERE publication_id = ?')
      .bind(input.publicationId).first<{ publication_id: string; actor_id: string }>();
    if (!publication) throw new Error('DOCTOR_KNOWLEDGE_UNKNOWN_PUBLICATION');
    if (publication.actor_id !== input.actorId) throw new Error('DOCTOR_KNOWLEDGE_PUBLICATION_ACTOR_MISMATCH');
  }
  if (input.supersedesId) {
    const prior = await db.prepare('SELECT statement_id, actor_id FROM doctor_statements WHERE statement_id = ?')
      .bind(input.supersedesId).first<{ statement_id: string; actor_id: string }>();
    if (!prior) throw new Error('DOCTOR_KNOWLEDGE_UNKNOWN_SUPERSEDED');
    if (prior.actor_id !== input.actorId) throw new Error('DOCTOR_KNOWLEDGE_SUPERSEDE_ACTOR_MISMATCH');
    await db.prepare(`UPDATE doctor_statements SET evidence_status = 'SUPERSEDED' WHERE statement_id = ?`)
      .bind(input.supersedesId).run();
  }
  const row: DoctorStatement = {
    statement_id: newId('statement'),
    actor_id: input.actorId,
    publication_id: input.publicationId ?? null,
    statement_text: input.statementText.trim(),
    statement_class: input.statementClass,
    evidence_status: evidenceStatus,
  };
  await db.prepare(
    `INSERT INTO doctor_statements
      (statement_id, actor_id, publication_id, statement_text, statement_class, evidence_status, extracted_at, supersedes_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(row.statement_id, row.actor_id, row.publication_id, row.statement_text, row.statement_class, row.evidence_status, input.extractedAt, input.supersedesId ?? null).run();
  return row;
}

export async function listActorPublications(db: D1Database, actorId: string): Promise<DoctorPublication[]> {
  return (await db.prepare('SELECT * FROM doctor_publications WHERE actor_id = ? ORDER BY published_at, publication_id')
    .bind(actorId).all<DoctorPublication>()).results;
}

export async function listActorStatements(
  db: D1Database,
  actorId: string,
  statementClass?: string,
): Promise<DoctorStatement[]> {
  if (statementClass) assertEnum(statementClass, STATEMENT_CLASSES, 'statement_class');
  const rows = statementClass
    ? await db.prepare('SELECT * FROM doctor_statements WHERE actor_id = ? AND statement_class = ? ORDER BY extracted_at, statement_id')
      .bind(actorId, statementClass).all<DoctorStatement>()
    : await db.prepare('SELECT * FROM doctor_statements WHERE actor_id = ? ORDER BY extracted_at, statement_id')
      .bind(actorId).all<DoctorStatement>();
  return rows.results;
}
