export { getModel, type ProviderType } from "./providers";
export type {
  JobMatchScores,
  JobMatchResult,
  JobMatchData,
} from "@/models/ai.schemas";
export { parseJobMatch } from "./jobMatch/parse";

// Prompts
export {
  RESUME_REVIEW_SYSTEM_PROMPT,
  JOB_MATCH_SYSTEM_PROMPT,
  buildResumeReviewPrompt,
  buildJobMatchPrompt,
  AUTOMATION_JOB_MATCH_SYSTEM_PROMPT,
  buildAutomationJobMatchPrompt,
  COLD_EMAIL_SYSTEM_PROMPT,
  buildColdEmailPrompt,
  COLD_EMAIL_SYSTEM_PROMPT_DE,
  buildColdEmailPromptDe,
  ATS_KEYWORDS_SYSTEM_PROMPT,
  buildAtsKeywordsPrompt,
  COVER_LETTER_SYSTEM_PROMPT,
  buildCoverLetterPrompt,
  COVER_LETTER_SYSTEM_PROMPT_DE,
  buildCoverLetterPromptDe,
  TAILORED_SUMMARY_SYSTEM_PROMPT,
  buildTailoredSummaryPrompt,
  TAILORED_SUMMARY_SYSTEM_PROMPT_DE,
  buildTailoredSummaryPromptDe,
} from "./prompts";

// Analysis tools
export { AIUnavailableError } from "./tools";

// Guardrails (factual-accuracy + natural-writing, shared across generation features)
export {
  AI_WRITING_TELL_RULES,
  detectWritingTells,
  verifyFactualAccuracy,
  generateVerifiedContent,
  DIN_5008_EMAIL_STRUCTURE,
  GERMAN_B1_LANGUAGE_RULES,
  GERMAN_WRITING_TELL_RULES,
  detectGermanB1Violations,
  type FactualSourceFacts,
  type FactualCheckResult,
  type GenerateVerifiedContentArgs,
  type GenerateVerifiedContentResult,
} from "./guardrails";

// Region/language detection (reused from the ATS module's EN/DE detector —
// see DECISIONS.md for why this phase reuses it instead of a persisted field)
export { detectAtsLanguage, type AtsLanguage } from "@/lib/ats";

// Resume preprocessing
export {
  preprocessResume,
  preprocessText,
  convertResumeToText,
  type PreprocessingResult,
  type ResumeMetadata,
  type PreprocessedResume,
} from "./tools/preprocessing";

// Job preprocessing
export {
  preprocessJob,
  convertJobToText,
  type JobPreprocessingResult,
  type JobMetadata,
  type PreprocessedJob,
} from "./tools/preprocessing-job";

// Shared text processing utilities
export {
  removeHtmlTags,
  normalizeWhitespace,
  normalizeBullets,
  normalizeHeadings,
  extractMetadata,
  validateText,
  type TextMetadata,
} from "./tools/text-processing";

export { checkRateLimit } from "./rate-limiter";
