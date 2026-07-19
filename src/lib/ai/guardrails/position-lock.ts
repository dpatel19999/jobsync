/**
 * Position-lock guardrail (soft/advisory, same pattern as writing-tells.ts
 * and region-language.ts's B1 check): resume rewrite may only reword
 * existing sentences — no reordering sections/bullets, no adding or
 * removing content. This is a heuristic post-check, not a second AI call.
 *
 * Line-based, not paragraph/blank-line-based: real PDF/DOCX text extraction
 * (see src/lib/ai/import/extract-text.ts) does not reliably preserve blank
 * lines between resume sections — confirmed against a real extracted PDF,
 * which came back as one continuous run of single-newline-separated lines
 * with no blank lines at all. Each line (a heading, a bullet, a fact) is
 * the actual natural unit in that output, so this counts non-empty lines
 * rather than blank-line-separated blocks. A mismatch can't prove
 * wording-only edits, but it's a reliable signal that content was added,
 * removed, merged, or split — exactly the failure mode this exists to catch.
 */

export interface PositionLockCheckResult {
  matched: boolean;
  originalLineCount: number;
  rewrittenLineCount: number;
}

// Exposed (not just used internally) so every consumer that needs to know
// what "one line" means for this feature — the prompt builders, this
// module's own check, and the .docx export's paragraph-alignment logic —
// shares exactly one definition instead of three that could drift apart.
export function splitNonEmptyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Exposed for the prompt builders, which tell the model the exact required
// line count up front — a concrete number is a much stronger instruction
// than an abstract "preserve the structure" rule.
export function countNonEmptyLines(text: string): number {
  return splitNonEmptyLines(text).length;
}

export function checkPositionLock(
  originalText: string,
  rewrittenText: string,
): PositionLockCheckResult {
  const originalLineCount = splitNonEmptyLines(originalText).length;
  const rewrittenLineCount = splitNonEmptyLines(rewrittenText).length;
  return {
    matched: originalLineCount === rewrittenLineCount,
    originalLineCount,
    rewrittenLineCount,
  };
}

export const POSITION_LOCK_RULES = `## STRUCTURE — POSITION LOCK (CRITICAL, DO NOT VIOLATE)
The ORIGINAL RESUME below is written one heading/fact/bullet per line. Your rewritten output MUST:
- Contain EXACTLY the same number of non-empty lines, in the exact same order.
- Map each input line to exactly one output line, reworded in place — never merge two lines into one, and never split one line into two.
- Never add a new line (no new bullet, sentence, or heading) and never remove an existing line.
- Only reword the words WITHIN each line — never reorder lines, sections, or bullets, even if a different order would read better.
- Do not introduce blank lines between sections unless the original already had them there.`;
