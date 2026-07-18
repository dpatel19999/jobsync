/**
 * ATS Keyword Extraction User Prompt
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildAtsKeywordsPrompt(jobDescriptionText: string): string {
  return `Extract ATS keywords from this job description.

JOB DESCRIPTION:
${fenceUntrustedContent(jobDescriptionText)}

Output one keyword per line, nothing else.`;
}
