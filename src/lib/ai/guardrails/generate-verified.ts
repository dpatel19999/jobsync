/**
 * Orchestrator combining a content-generation call with the factual-accuracy
 * guardrail (hard constraint, see factual-accuracy.ts) and the natural-writing
 * guardrail (soft constraint, see writing-tells.ts). Any feature that
 * generates first-person outbound content (cold email, and future cover
 * letter / CV generation) should call this instead of calling generateText
 * directly, so the guardrails apply everywhere the same way.
 */

import { generateText, type LanguageModel } from "ai";
import {
  verifyFactualAccuracy,
  type FactualSourceFacts,
} from "./factual-accuracy";
import { detectWritingTells } from "./writing-tells";

export interface GenerateVerifiedContentArgs {
  model: LanguageModel;
  system: string;
  prompt: string;
  temperature: number;
  facts: FactualSourceFacts;
}

export interface GenerateVerifiedContentResult {
  content: string;
  verified: boolean;
  unsupportedClaims: string[];
  attempts: number;
  /** Non-null only when factual verification still fails after one retry. */
  warning: string | null;
}

const MAX_REGENERATE_ATTEMPTS = 1;

function buildRegeneratePrompt(originalPrompt: string, unsupportedClaims: string[]): string {
  return `${originalPrompt}

Your previous draft included claims that are not supported by the source facts above:
${unsupportedClaims.map((c) => `- ${c}`).join("\n")}

Regenerate the draft. Use ONLY facts that literally appear in the resume and job description. Remove or replace anything unsupported rather than softening the wording.`;
}

export async function generateVerifiedContent(
  args: GenerateVerifiedContentArgs
): Promise<GenerateVerifiedContentResult> {
  const { model, system, prompt, temperature, facts } = args;

  let attempts = 0;
  let currentPrompt = prompt;
  let content = "";
  let check = { verified: false, unsupportedClaims: [] as string[] };

  while (attempts <= MAX_REGENERATE_ATTEMPTS) {
    attempts += 1;

    const result = await generateText({
      model,
      system,
      prompt: currentPrompt,
      temperature,
    });
    content = result.text.trim();

    check = await verifyFactualAccuracy(model, content, facts);
    if (check.verified) {
      break;
    }

    if (attempts <= MAX_REGENERATE_ATTEMPTS) {
      currentPrompt = buildRegeneratePrompt(prompt, check.unsupportedClaims);
    }
  }

  const tellHits = detectWritingTells(content);
  if (tellHits.length > 0) {
    console.warn(
      `[writing-guardrails] natural-writing tells detected (soft constraint, not blocking): ${tellHits
        .map((h) => h.rule)
        .join(", ")}`
    );
  }

  const warning = check.verified
    ? null
    : `This draft may include claims not found in your resume/job data and could not be auto-corrected: ${check.unsupportedClaims.join(
        "; "
      )}. Please review before sending.`;

  return {
    content,
    verified: check.verified,
    unsupportedClaims: check.unsupportedClaims,
    attempts,
    warning,
  };
}
