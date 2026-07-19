/**
 * Tailored Resume Summary User Prompt — German (DE) path.
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildTailoredSummaryPromptDe(
  resumeText: string,
  jobText: string,
): string {
  return `Write a 2-3 sentence tailored resume summary in German for this candidate, highlighting the experience most relevant to the job description below.

RESUME:
${fenceUntrustedContent(resumeText)}

JOB DESCRIPTION:
${fenceUntrustedContent(jobText)}

Output only the 2-3 sentence summary, in German. Use only facts present in the resume above.`;
}
