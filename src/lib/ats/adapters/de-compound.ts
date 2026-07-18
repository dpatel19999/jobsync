/**
 * Dictionary-driven German compound-noun splitter.
 *
 * No dedicated, maintained JS library exists for this (checked npm + GitHub
 * before writing this — see DECISIONS.md). This implements the same
 * technique real splitters use: recursively try split points, accept a
 * position where both sides resolve to real German words (via the
 * Hunspell wordlist in de-dictionary.ts), stripping a linking morpheme
 * (Fugenelement: -s/-es/-n/-en/-e) from the left part where needed. It is
 * not a fixed heuristic suffix list — the wordlist is what decides whether
 * a split is valid.
 */

const MIN_PART_LENGTH = 3;
const MAX_SPLIT_DEPTH = 4;
// Longest first so "es"/"en" aren't shadowed by a premature match on "e"/"n".
const LINKING_SUFFIXES = ["es", "en", "er", "s", "n", "e"];

function resolveKnownForm(part: string, dict: Set<string>): string | null {
  if (dict.has(part)) return part;
  for (const suffix of LINKING_SUFFIXES) {
    if (part.length > suffix.length && part.endsWith(suffix)) {
      const stripped = part.slice(0, part.length - suffix.length);
      if (stripped.length >= MIN_PART_LENGTH && dict.has(stripped)) {
        return stripped;
      }
    }
  }
  return null;
}

/**
 * Splits a lowercased German word into its dictionary-recognized parts.
 * Returns [word] unchanged if it's already a known word or no valid split
 * is found. Prefers the split with the longest right-hand part, since
 * German compounds are right-headed (the tail carries the core meaning).
 *
 * Both sides accept a linking-morpheme-stripped match, not just the left —
 * the tail of a compound still inflects for case/number in running text
 * (e.g. "Datenanalysen", plural), so "analysen" must resolve to "analyse"
 * the same way "daten" resolves on the left.
 */
export function splitGermanCompound(
  word: string,
  dict: Set<string>,
  depth = 0,
): string[] {
  if (dict.has(word)) return [word];
  if (word.length < MIN_PART_LENGTH * 2 || depth >= MAX_SPLIT_DEPTH) {
    return [word];
  }

  let best: { left: string; rightParts: string[] } | null = null;
  let bestRightSpan = 0;

  for (let i = MIN_PART_LENGTH; i <= word.length - MIN_PART_LENGTH; i++) {
    const rawLeft = word.slice(0, i);
    const right = word.slice(i);

    const left = resolveKnownForm(rawLeft, dict);
    if (!left) continue;

    let rightParts: string[] | null = null;
    const directRight = resolveKnownForm(right, dict);
    if (directRight) {
      rightParts = [directRight];
    } else if (right.length >= MIN_PART_LENGTH * 2) {
      const sub = splitGermanCompound(right, dict, depth + 1);
      if (sub.length > 1) {
        rightParts = sub;
      }
    }
    if (!rightParts) continue;

    if (right.length > bestRightSpan) {
      best = { left, rightParts };
      bestRightSpan = right.length;
    }
  }

  if (!best) return [word];
  return [best.left, ...best.rightParts];
}
