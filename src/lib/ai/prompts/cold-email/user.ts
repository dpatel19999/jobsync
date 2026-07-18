/**
 * Cold Email User Prompt
 * Builds the user prompt for cold-email generation from resume + job text.
 */

import { fenceUntrustedContent } from "@/lib/ai/guardrails/prompt-fencing";

export function buildColdEmailPrompt(
  resumeText: string,
  jobText: string,
  companyName: string,
): string {
  return `Write a short cold email to a hiring contact at ${companyName} for the role described below, based on this candidate's real resume.

RESUME:
${fenceUntrustedContent(resumeText)}

JOB DESCRIPTION:
${fenceUntrustedContent(jobText)}

Output only the email body, 4-6 sentences, mentioning ${companyName} by name and one concrete detail from the job description. Use only facts present in the resume above.`;
}
