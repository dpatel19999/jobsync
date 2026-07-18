/**
 * Factual-accuracy guardrail (hard constraint).
 * CLAUDE.md rule #1: every claim in generated content must trace back to the
 * loaded resume/job data. This runs a second, cheap Ollama call whose only
 * job is to compare the generated draft against the source facts and flag
 * anything unsupported — a stricter prompt alone isn't a check, it's still
 * just a request, so this verifies the actual output.
 */

import { generateText, type LanguageModel } from "ai";
import { TEMPERATURES } from "@/lib/ai/config";

export interface FactualSourceFacts {
  resumeText: string;
  jobText: string;
}

export interface FactualCheckResult {
  verified: boolean;
  unsupportedClaims: string[];
}

const FACT_CHECK_SYSTEM_PROMPT = `You are a fact-checker verifying that a DRAFT doesn't invent facts beyond the SOURCE FACTS (a resume and a job description) it was supposed to be based on.

Your only job: find any claim in the DRAFT about the candidate's skills, experience, employers, job titles, metrics, or achievements that introduces information NOT present anywhere in the SOURCE FACTS — a specific employer, title, credential, technology, or metric that the source facts never mention at all.

## NOT VIOLATIONS — DO NOT FLAG THESE
- Paraphrasing, summarizing, or restating a real fact in different words
- Reasonable rounding of a date range to a duration (e.g. 2022-2025 described as "three years" or "a few years")
- Using a job title/headline that appears ANYWHERE in the source facts, even if a different section uses different wording
- Generic phrasing, tone, greetings, calls to action, soft claims of enthusiasm or fit ("I believe this would be a good fit")
- Facts about the COMPANY/ROLE that come from the job description itself

Only flag a claim if it introduces a specific fact — a named employer, job title, technology, certification, or number — that does not appear anywhere in the source facts, even approximately.

## OUTPUT FORMAT (FOLLOW EXACTLY)
If there are no such fabricated claims, output exactly: NONE
Otherwise, output one fabricated claim per line, each prefixed with "UNSUPPORTED: ". No other text.`;

function buildFactCheckPrompt(draft: string, facts: FactualSourceFacts): string {
  return `SOURCE FACTS — RESUME:
${facts.resumeText}

SOURCE FACTS — JOB DESCRIPTION:
${facts.jobText}

DRAFT TO CHECK:
${draft}

List any claim in the draft about the candidate that the source facts above do not support.`;
}

export async function verifyFactualAccuracy(
  model: LanguageModel,
  draft: string,
  facts: FactualSourceFacts
): Promise<FactualCheckResult> {
  const result = await generateText({
    model,
    system: FACT_CHECK_SYSTEM_PROMPT,
    prompt: buildFactCheckPrompt(draft, facts),
    temperature: TEMPERATURES.ANALYSIS,
  });

  const text = result.text.trim();
  if (/^NONE\s*$/i.test(text)) {
    return { verified: true, unsupportedClaims: [] };
  }

  const unsupportedClaims = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^UNSUPPORTED:\s*/i, ""));

  // A response that doesn't follow the format (no "NONE", no "UNSUPPORTED:"
  // lines) is treated as unverified rather than silently passed — an
  // unparseable fact-check result is not the same as a clean bill of health.
  if (unsupportedClaims.length === 0) {
    return { verified: false, unsupportedClaims: [text] };
  }

  return { verified: false, unsupportedClaims };
}
