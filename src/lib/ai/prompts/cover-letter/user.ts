/**
 * Cover Letter User Prompt
 * Builds the user prompt for cover-letter generation from resume + job text.
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildCoverLetterPrompt(
  resumeText: string,
  jobText: string,
  companyName: string,
): string {
  return `Write a standard cover letter for a role at ${companyName} described below, based on this candidate's real resume.

RESUME:
${fenceUntrustedContent(resumeText)}

JOB DESCRIPTION:
${fenceUntrustedContent(jobText)}

Output only the cover letter body (opening, 2-3 body paragraphs, closing), mentioning ${companyName} by name and connecting concrete details from the job description to real facts from the resume above.`;
}
