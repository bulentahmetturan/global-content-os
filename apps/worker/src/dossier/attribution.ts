/**
 * GENERIC source attribution capability. Some official sources publish terms that require attribution and processing context for
 * downstream use. A connector declares those requirements once, in its descriptor; the runtime combines them with the per-run
 * retrieval / processing times into an AttributionNotice that any later consumer (research handoff, export, editorial rendering,
 * provenance display) can carry. Nothing source-specific lives here, no UI is implied and nothing is published.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';

export type AttributionRequirement = (typeof vocab.attribution.requirements)[number];

/** Static, per source: what the terms ask for. */
export interface SourceAttribution {
  attribution_required: boolean;
  source_display_name: string;
  /** Where the terms / source live (a reference, not a scraped copy). */
  source_reference: string;
  /** What this system does to the data before showing it (a processing description, never a scientific claim). */
  transformation_note: string;
  attribution_requirements: AttributionRequirement[];
}
/** Per run: the static declaration plus when the data were retrieved and processed. */
export interface AttributionNotice extends SourceAttribution {
  source_id: string;
  retrieved_at: string | null;
  processed_at: string | null;
}

export function validateAttribution(a: SourceAttribution): string[] {
  const e: string[] = [];
  for (const r of a.attribution_requirements) if (!(vocab.attribution.requirements as string[]).includes(r)) e.push(`attribution_requirement_not_in_vocabulary:${r}`);
  if (a.attribution_required) {
    if (!a.source_display_name.trim()) e.push('source_display_name_required');
    if (!a.source_reference.trim()) e.push('source_reference_required');
    if (!a.attribution_requirements.includes('ATTRIBUTE_SOURCE')) e.push('attribution_required_needs_attribute_source_requirement');
    if (a.attribution_requirements.includes('STATE_MODIFICATIONS') && !a.transformation_note.trim()) e.push('transformation_note_required_when_modifications_must_be_stated');
  } else if (a.attribution_requirements.length) e.push('requirements_declared_but_attribution_not_required');
  return e;
}

/** Notice for one run. `processed_at` is mandatory only when the terms ask for the processing date to be displayed. */
export function buildAttributionNotice(sourceId: string, a: SourceAttribution, when: { retrievedAt: string | null; processedAt: string | null }): AttributionNotice {
  const errors = validateAttribution(a);
  if (errors.length) throw new Error(`attribution_invalid:${errors.join(',')}`);
  if (a.attribution_requirements.includes('DISPLAY_PROCESSED_DATE') && !when.processedAt) throw new Error('attribution_invalid:processed_at_required');
  return { ...a, source_id: sourceId, retrieved_at: when.retrievedAt, processed_at: when.processedAt };
}

/** The compact line a consumer may render; it states modifications when the terms require it and implies nothing about the content. */
export function attributionLine(n: AttributionNotice): string {
  if (!n.attribution_required) return '';
  const parts = [`Source: ${n.source_display_name}`];
  if (n.attribution_requirements.includes('DISPLAY_PROCESSED_DATE') && n.processed_at) parts.push(`data processed ${n.processed_at.slice(0, 10)}`);
  if (n.attribution_requirements.includes('STATE_MODIFICATIONS')) parts.push(n.transformation_note);
  return parts.join('; ');
}
