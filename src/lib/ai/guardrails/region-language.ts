/**
 * German region/language writing rules — DIN 5008 email conventions + the
 * CLAUDE.md B1-level cap. Extends the Phase 1 guardrail module rather than
 * duplicating it: GERMAN_WRITING_TELL_RULES is AI_WRITING_TELL_RULES plus
 * German-specific additions, not a separate parallel list.
 */

import { AI_WRITING_TELL_RULES } from "./writing-tells";

export const DIN_5008_EMAIL_STRUCTURE = `## STRUCTURE (DIN 5008 formal email conventions)
- First line: "Betreff: " followed by a short, specific subject line (the role and, if it fits naturally, the company name).
- Blank line, then a formal salutation. If the job description names a specific hiring manager or recruiter, address them by name: "Sehr geehrte Frau [Nachname]," or "Sehr geehrter Herr [Nachname],". Otherwise use "Sehr geehrte Damen und Herren,".
- Body in short paragraphs separated by blank lines (not one dense block).
- Formal closing: "Mit freundlichen Grüßen", blank line, then the candidate's name from the resume contact info.
- Always address the reader formally with "Sie"/"Ihnen"/"Ihr" (capitalized), never "du".`;

export const GERMAN_B1_LANGUAGE_RULES = `## LANGUAGE LEVEL (genuine B1, not native-fluent German)
- Simple, everyday vocabulary. Avoid rare or highly formal/bureaucratic words when a simpler one says the same thing.
- Sentences roughly 15-20 words. Split any longer thought into two sentences rather than joining it with multiple subordinate clauses.
- Do not use Konjunktiv II (no "würde", "hätte", "wäre", "könnte" used as polite hedging) — write direct statements instead.
- No idioms or figurative expressions (no "die Weichen stellen", "das Rennen machen", etc.) — say the literal thing.
- Avoid heavy Nominalstil (stacking noun phrases like "im Rahmen der Umsetzung der Zielsetzung") — prefer verbs and direct sentences.`;

export const GERMAN_WRITING_TELL_RULES = `${AI_WRITING_TELL_RULES}

## GERMAN-SPECIFIC ADDITIONS
- No "nicht nur X, sondern auch Y" framing (the German equivalent of "not just X, it's Y")
- No "Des Weiteren," "Darüber hinaus," "Zudem," as stacked formal transition openers
- No stacked formal adjective triplets ("innovativ, skalierbar und robust")`;

interface B1ViolationHit {
  rule: string;
  excerpt: string;
}

const KONJUNKTIV_II_MARKERS = /\b(würde|würden|hätte|hätten|wäre|wären|könnte|könnten)\b/gi;

/**
 * Heuristic, regex-based spot-check for the B1/DIN constraints — same
 * soft/advisory role as detectWritingTells (logging + verification scripts,
 * not a hard regenerate gate).
 */
export function detectGermanB1Violations(text: string): B1ViolationHit[] {
  const hits: B1ViolationHit[] = [];

  const konjunktivMatches = text.match(KONJUNKTIV_II_MARKERS) ?? [];
  if (konjunktivMatches.length > 0) {
    hits.push({
      rule: "konjunktiv-ii",
      excerpt: `${konjunktivMatches.length} occurrence(s): ${konjunktivMatches.join(", ")}`,
    });
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 25);
  if (longSentences.length > 0) {
    hits.push({
      rule: "sentence-too-long-for-b1",
      excerpt: longSentences[0],
    });
  }

  if (/\bnicht\s+nur\b.*\bsondern\s+auch\b/i.test(text)) {
    hits.push({ rule: "nicht-nur-x-sondern-auch-y", excerpt: "nicht nur ... sondern auch" });
  }

  return hits;
}
