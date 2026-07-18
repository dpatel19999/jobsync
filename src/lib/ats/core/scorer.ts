/**
 * Language-agnostic ATS keyword scoring core.
 * Pure set comparison, weighting, and scoring math — no tokenization,
 * stemming, or language-specific logic. Adapters normalize text into the
 * token sets this module consumes.
 */

export interface KeywordTokens {
  /** Original keyword text, for display. */
  keyword: string;
  /** Normalized/stemmed tokens representing this keyword. */
  tokens: string[];
  /** Relative importance; defaults to 1 (all keywords weighted equally). */
  weight?: number;
}

export interface ScoredKeyword {
  keyword: string;
  weight: number;
}

export interface KeywordScoreResult {
  /** 0-100 */
  score: number;
  matched: ScoredKeyword[];
  missing: ScoredKeyword[];
}

/**
 * A keyword matches when every one of its normalized tokens is present in
 * the resume's token set (order-agnostic AND-match). This lets a multi-word
 * keyword like "REST APIs" match on {rest, api} both appearing anywhere in
 * the resume, and lets compound sub-parts (see the DE adapter) match on a
 * shared stem rather than full-word equality.
 */
export function scoreKeywords(
  resumeTokens: Set<string>,
  keywords: KeywordTokens[],
): KeywordScoreResult {
  const matched: ScoredKeyword[] = [];
  const missing: ScoredKeyword[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const { keyword, tokens, weight = 1 } of keywords) {
    totalWeight += weight;
    const isMatch = tokens.length > 0 && tokens.every((t) => resumeTokens.has(t));
    if (isMatch) {
      matchedWeight += weight;
      matched.push({ keyword, weight });
    } else {
      missing.push({ keyword, weight });
    }
  }

  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  return { score, matched, missing };
}
