/**
 * Find http(s) URLs in free-form user text. Conservative — we'd rather
 * miss a borderline case than fetch something the user didn't intend.
 *
 * Returns deduplicated URLs in the order they first appear, capped at
 * `limit` (default 3) so a copy-pasted wall of links can't burn the
 * entire fetch budget on a single turn.
 */

const URL_RE = /\bhttps?:\/\/[^\s<>()"'`]+/gi;

const NORMALISE = (raw: string): string => {
  // Strip trailing punctuation that's almost certainly part of the surrounding
  // sentence rather than the URL itself: "see https://x.com/foo." → drop the dot.
  let trimmed = raw.replace(/[\s.,;:!?。，；：！？、\]\)]+$/u, '');
  // If the URL had an unmatched opening paren upstream (e.g. inline markdown),
  // also strip the leading paren to keep the URL parseable by `new URL`.
  if (trimmed.endsWith(')') && !trimmed.includes('(')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

export function extractUrls(text: string, limit = 3): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const cleaned = NORMALISE(match[0]);
    if (!cleaned) continue;
    // Validate parseability — we don't want to feed garbage to fetch().
    try {
      const u = new URL(cleaned);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}
