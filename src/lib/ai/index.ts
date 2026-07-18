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
  ATS_KEYWORDS_SYSTEM_PROMPT,
  buildAtsKeywordsPrompt,
} from "./prompts";

// Analysis tools
export { AIUnavailableError } from "./tools";

// Guardrails (factual-accuracy + natural-writing, shared across generation features)
export {
  AI_WRITING_TELL_RULES,
  detectWritingTells,
  verifyFactualAccuracy,
  generateVerifiedContent,
  type FactualSourceFacts,
  type FactualCheckResult,
  type GenerateVerifiedContentArgs,
  type GenerateVerifiedContentResult,
} from "./guardrails";

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
