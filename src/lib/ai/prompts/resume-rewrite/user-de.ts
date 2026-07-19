/**
 * Position-Locked Resume Rewrite — User Prompt, German (DE) path.
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";
import { countNonEmptyLines } from "@/lib/ai/guardrails/position-lock";

export function buildResumeRewritePromptDe(
  templateText: string,
  jobText: string,
): string {
  const lineCount = countNonEmptyLines(templateText);
  return `Rewrite the ORIGINAL RESUME below, in German, line by line, to better match the TARGET JOB DESCRIPTION's language and keywords — without adding, removing, merging, or reordering any line.

The ORIGINAL RESUME below has EXACTLY ${lineCount} non-empty lines. Note that some lines are a PDF's mid-sentence word-wrap, not a real line break — reword each one in place anyway; do NOT rejoin, merge, or reflow wrapped lines into fewer, denser lines. Your output must also have EXACTLY ${lineCount} non-empty lines — count them before answering.

ORIGINAL RESUME (rewrite this, line-for-line, in the exact same order):
${fenceUntrustedContent(templateText)}

TARGET JOB DESCRIPTION (use only to inform word choice — not a source of new facts):
${fenceUntrustedContent(jobText)}

Output only the rewritten resume text, in German, with EXACTLY ${lineCount} non-empty lines, in the same order as the original resume above.`;
}
