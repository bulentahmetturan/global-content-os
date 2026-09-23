/**
 * Repairs a specific, confirmed-live mojibake pattern (2026-09-23): text whose real UTF-8 bytes
 * got decoded a second time as Windows-1252 somewhere upstream, turning e.g. "ğ" (UTF-8: C4 9F)
 * into the two separate characters "Ä" + "Ÿ" (U+00C4, U+0178 — the cp1252 codepoints for those
 * byte values). Verified against real corrupted Kaduse titles: this exactly reconstructs correct
 * Turkish text ("SaÄŸlÄ±k" → "Sağlık"), and safely no-ops on already-correct text, because a
 * genuine Unicode character above U+00FF (which "ğ" itself is, U+011F) makes it bail out
 * immediately rather than mangling already-fine text.
 */
const CP1252_HIGH: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
  '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

export function repairMojibake(s: string): string {
  if (!s) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const mapped = CP1252_HIGH[ch];
    if (mapped !== undefined) bytes.push(mapped);
    else if (cp <= 0xff) bytes.push(cp);
    else return s; // a real non-Latin1 codepoint is present — not this corruption, leave as-is
  }
  try {
    // No Buffer in the Workers runtime (no nodejs_compat) — TextDecoder does the same
    // byte-reinterpretation job and is a standard Web API available here.
    const repaired = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes));
    return repaired;
  } catch {
    return s; // not valid UTF-8 once reinterpreted — wasn't this corruption, leave as-is
  }
}
