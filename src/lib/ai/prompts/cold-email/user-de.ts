/**
 * Cold Email User Prompt — German (DE) path.
 * Mirrors user.ts's shape; kept as a separate function (not a language
 * branch inside the same function) so the English path stays untouched.
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildColdEmailPromptDe(
  resumeText: string,
  jobText: string,
  companyName: string,
): string {
  return `Write a short cold email in German to a hiring contact at ${companyName} for the role described below, based on this candidate's real resume.

RESUME:
${fenceUntrustedContent(resumeText)}

JOB DESCRIPTION:
${fenceUntrustedContent(jobText)}

Output only the email text (Betreff line, salutation, body, closing, signature), in German, mentioning ${companyName} by name and one concrete detail from the job description. Use only facts present in the resume above.`;
}
