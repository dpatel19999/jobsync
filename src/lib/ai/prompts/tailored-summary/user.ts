/**
 * Tailored Resume Summary User Prompt
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildTailoredSummaryPrompt(
  resumeText: string,
  jobText: string,
): string {
  return `Write a 2-3 sentence tailored resume summary for this candidate, highlighting the experience most relevant to the job description below.

RESUME:
${fenceUntrustedContent(resumeText)}

JOB DESCRIPTION:
${fenceUntrustedContent(jobText)}

Output only the 2-3 sentence summary. Use only facts present in the resume above.`;
}
