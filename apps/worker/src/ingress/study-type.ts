/**
 * Bible 13.1 `study_type` filler. Only states a type the source itself declares (PubMed / Europe PMC publication-type
 * tags) or the title says outright. Anything else stays null = UNKNOWN (Bible 0.4: never guess a critical field).
 */
const TAG_MAP: Array<[RegExp, string]> = [
  [/^randomi[sz]ed controlled trial/i, 'randomized_controlled_trial'],
  [/^meta-analysis/i, 'meta_analysis'],
  [/^systematic review/i, 'systematic_review'],
  [/^(clinical trial|controlled clinical trial|pragmatic clinical trial)/i, 'clinical_trial'],
  [/^(observational study|cohort studies?|case-control studies?|cross-sectional studies?)/i, 'observational_study'],
  [/^(case reports?)/i, 'case_report'],
  [/^(practice guideline|guideline|consensus development conference)/i, 'guideline'],
  [/^(review|scoping review|narrative review)/i, 'narrative_review'],
  [/^preprint/i, 'preprint'],
];

const TITLE_MAP: Array<[RegExp, string]> = [
  [/\bsystematic review and meta-?analysis\b|\bmeta-?analysis\b/i, 'meta_analysis'],
  [/\bsystematic review\b/i, 'systematic_review'],
  [/\brandomi[sz]ed\b.*\b(trial|study)\b|\brandomi[sz]ed controlled\b/i, 'randomized_controlled_trial'],
  [/\b(cohort|cross-sectional|case-control|prospective|retrospective) (study|analysis)\b/i, 'observational_study'],
  [/\bscoping review\b|\bnarrative review\b/i, 'narrative_review'],
  [/\bcase report\b/i, 'case_report'],
];

/** Highest-evidence tag wins when several are present. */
const RANK = ['meta_analysis', 'systematic_review', 'randomized_controlled_trial', 'clinical_trial', 'observational_study', 'guideline', 'narrative_review', 'case_report', 'preprint'];

export function inferStudyType(tags: ReadonlyArray<string> | null | undefined, title?: string | null): string | null {
  const found = new Set<string>();
  for (const t of tags ?? []) {
    for (const [re, v] of TAG_MAP) if (re.test(t.trim())) found.add(v);
  }
  if (found.size === 0 && title) {
    for (const [re, v] of TITLE_MAP) if (re.test(title)) found.add(v);
  }
  for (const v of RANK) if (found.has(v)) return v;
  return null;
}
