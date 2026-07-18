/**
 * Shared AI-writing-tell ban list.
 * Single source of truth for CLAUDE.md's "no AI-writing tells" hard rule —
 * every first-person outbound content generator (cold email, and future
 * cover-letter/CV generation) imports this instead of copying its own list.
 */

export const AI_WRITING_TELL_RULES = `## WRITING STYLE — AVOID THESE AI TELLS
- No "not just X, it's Y" or "isn't just about X, it's about Y" framing
- No rule-of-three adjective or noun stacking (e.g. "innovative, scalable, and robust")
- No em-dash overuse — use at most one, or none
- No "Furthermore," "Moreover," "Additionally," or similar formal transition openers
- No bolded-phrase-then-restated pattern (stating a point, then repeating it in different words for emphasis)
- No inflated-significance closers ("I would be thrilled...", "I am confident this would be a great fit...", "I look forward to the opportunity to contribute to your continued success")
- No generic buzzword filler ("passionate," "dynamic," "results-driven," "synergy," "leverage" as a verb)
- Write like a real person, not a template: plain, direct, varied sentence length, no corporate filler`;

interface WritingTellHit {
  rule: string;
  excerpt: string;
}

const EM_DASH = "—";

/**
 * Heuristic, regex-based detector for the same patterns banned in
 * AI_WRITING_TELL_RULES. This is a soft/advisory check (logged, not
 * enforced by regeneration) — used for verification scripts and optional
 * runtime logging, not as a hard gate like the factual-accuracy guardrail.
 */
export function detectWritingTells(text: string): WritingTellHit[] {
  const hits: WritingTellHit[] = [];

  const notJustMatch = text.match(
    /(?:is\s*n['’]?t|is\s+not|not)\s+just\s+[^,.;]+,?\s+(it['’]?s|it\s+is)\s+[^,.;]+/i
  );
  if (notJustMatch) {
    hits.push({ rule: "not-just-x-its-y", excerpt: notJustMatch[0] });
  }

  const emDashCount = (text.match(new RegExp(EM_DASH, "g")) ?? []).length;
  if (emDashCount > 1) {
    hits.push({ rule: "em-dash-overuse", excerpt: `${emDashCount} em-dashes found` });
  }

  const transitionMatch = text.match(/\b(Furthermore|Moreover|Additionally)\b,/);
  if (transitionMatch) {
    hits.push({ rule: "formal-transition-opener", excerpt: transitionMatch[0] });
  }

  // Three lowercase (not capitalized-proper-noun / product-name-looking)
  // words joined "X, Y, and Z" — catches both adjective and noun stacking.
  // Case-sensitive on purpose: a real tech list ("Node.js, PostgreSQL, and
  // AWS") is capitalized and shouldn't trip this.
  const ruleOfThreeMatch = text.match(/\b([a-z]{4,}),\s*([a-z]{4,}),?\s+and\s+([a-z]{4,})\b/);
  if (ruleOfThreeMatch) {
    hits.push({ rule: "rule-of-three-adjective-stack", excerpt: ruleOfThreeMatch[0] });
  }

  const inflatedCloserMatch = text.match(
    /\b(I would be thrilled|I am confident this|I look forward to the opportunity to contribute to your continued success)\b/i
  );
  if (inflatedCloserMatch) {
    hits.push({ rule: "inflated-significance-closer", excerpt: inflatedCloserMatch[0] });
  }

  const buzzwordMatch = text.match(
    /\b(passionate|dynamic individual|results-driven|synergy|leverage(?:d|s|ing)?\s+(?:my|our|their))\b/i
  );
  if (buzzwordMatch) {
    hits.push({ rule: "buzzword-filler", excerpt: buzzwordMatch[0] });
  }

  return hits;
}
