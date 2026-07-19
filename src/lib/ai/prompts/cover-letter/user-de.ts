/**
 * Cover Letter User Prompt — German (DE) path.
 * Mirrors user.ts's shape; kept as a separate function (not a language
 * branch inside the same function) so the English path stays untouched.
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildCoverLetterPromptDe(
  resumeText: string,
  jobText: string,
  companyName: string,
): string {
  return `Write a standard cover letter in German for a role at ${companyName} described below, based on this candidate's real resume.

RESUME:
${fenceUntrustedContent(resumeText)}

JOB DESCRIPTION:
${fenceUntrustedContent(jobText)}

Output only the cover letter text (Betreff line, salutation, opening, 2-3 body paragraphs, closing, signature), in German, mentioning ${companyName} by name and connecting concrete details from the job description to real facts from the resume above.`;
}
