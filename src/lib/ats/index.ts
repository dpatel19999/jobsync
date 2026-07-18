/**
 * ATS keyword scoring orchestrator.
 * Picks an EN/DE adapter from the job description's detected language, then
 * runs the language-agnostic core (scorer.ts) against the resume text and
 * the job's (editable) keyword list.
 */

import { scoreKeywords, type KeywordScoreResult } from "./core/scorer";
import { detectAtsLanguage } from "./language-detect";
import { englishAdapter } from "./adapters/en";
import { germanAdapter } from "./adapters/de";
import type { AtsLanguage, AtsLanguageAdapter } from "./adapters/types";

export type { AtsLanguage } from "./adapters/types";
export type { KeywordScoreResult, ScoredKeyword } from "./core/scorer";
export { detectAtsLanguage } from "./language-detect";

const ADAPTERS: Record<AtsLanguage, AtsLanguageAdapter> = {
  en: englishAdapter,
  de: germanAdapter,
};

export interface AtsScoreResult extends KeywordScoreResult {
  language: AtsLanguage;
}

export async function scoreResumeAgainstKeywords(
  resumeText: string,
  keywords: string[],
  jobDescriptionText: string,
): Promise<AtsScoreResult> {
  const language = detectAtsLanguage(jobDescriptionText);
  const adapter = ADAPTERS[language];

  const resumeTokens = new Set(await adapter.tokenize(resumeText));
  const keywordTokens = await Promise.all(
    keywords.map(async (keyword) => ({
      keyword,
      tokens: await adapter.tokenize(keyword),
    })),
  );

  const result = scoreKeywords(resumeTokens, keywordTokens);
  return { language, ...result };
}
