/**
 * WHO Newsroom audience-fit gate (owner decision 2026-10-26, refined 2026-10-30).
 * A foreign item enters only if it addresses people in Türkiye OR carries world-level "wow" value.
 * For WHO that means: Türkiye, Muslim geographies (e.g. Gaza), general public-health rules/guidance,
 * or a world-scale landmark. Global outbreak / emergency alerts are NOT a reason to enter on their
 * own; they pass only through Türkiye or a Muslim geography.
 *
 * Positive allow-list on title+summary (English; WHO publishes English). Fail-closed for items that
 * match nothing: they are skipped, not stored.
 */

const TURKIYE = /\b(turkey|t[uü]rkiye|turkish|ankara|istanbul|izmir)\b/i;

const MUSLIM_GEOGRAPHY = new RegExp(
  '\\b(' +
    [
      'gaza', 'palestin\\w*', 'west bank', 'occupied palestinian', 'syria\\w*', 'yemen\\w*',
      'sudan\\w*', 'afghanistan', 'afghan\\w*', 'iraq\\w*', 'lebanon', 'lebanese', 'iran\\w*',
      'pakistan\\w*', 'bangladesh\\w*', 'somalia\\w*', 'libya\\w*', 'jordan\\w*', 'egypt\\w*',
      'saudi\\w*', 'indonesia\\w*', 'rohingya', 'cox.s bazar', 'azerbaijan\\w*', 'kosovo',
      'bosnia\\w*', 'albania\\w*', 'uzbekistan', 'kazakhstan', 'kyrgyz\\w*', 'tajikistan',
      'turkmenistan', 'hajj', 'umrah', 'ramadan', 'muslim\\w*', 'islamic', 'mecca', 'medina',
      'oic', 'eastern mediterranean',
    ].join('|') +
    ')\\b',
  'i'
);

const PUBLIC_HEALTH_RULES = new RegExp(
  '\\b(' +
    [
      'guideline\\w*', 'guidance', 'recommend\\w*', 'new standards?', 'international health regulations',
      'pandemic agreement', 'framework convention', 'tobacco', 'air pollution', 'ultra-processed',
      'sugar', 'trans fat', 'salt', 'antimicrobial resistance', 'vaccine safety', 'immunization schedule',
    ].join('|') +
    ')\\b',
  'i'
);

const WORLD_WOW = new RegExp(
  '\\b(' +
    [
      'first-ever', 'first ever', 'landmark', 'historic', 'worldwide', 'global report',
      'global estimates?', 'global status report', 'world health statistics', 'all countries',
      'every country', 'eradicat\\w*', 'declared free',
    ].join('|') +
    ')\\b',
  'i'
);

export type WhoAudienceVerdict =
  | { ok: true; reason: 'turkiye' | 'muslim_geography' | 'public_health_rules' | 'world_wow' }
  | { ok: false; reason: 'no_audience_fit' };

export function whoAudienceFit(title: string, summary: string): WhoAudienceVerdict {
  const text = `${title || ''} ${summary || ''}`;
  if (TURKIYE.test(text)) return { ok: true, reason: 'turkiye' };
  if (MUSLIM_GEOGRAPHY.test(text)) return { ok: true, reason: 'muslim_geography' };
  if (PUBLIC_HEALTH_RULES.test(text)) return { ok: true, reason: 'public_health_rules' };
  if (WORLD_WOW.test(text)) return { ok: true, reason: 'world_wow' };
  return { ok: false, reason: 'no_audience_fit' };
}
