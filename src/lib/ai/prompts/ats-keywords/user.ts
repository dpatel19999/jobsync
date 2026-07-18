/**
 * ATS Keyword Extraction User Prompt
 */

export function buildAtsKeywordsPrompt(jobDescriptionText: string): string {
  return `Extract ATS keywords from this job description.

JOB DESCRIPTION:
${jobDescriptionText}

Output one keyword per line, nothing else.`;
}
