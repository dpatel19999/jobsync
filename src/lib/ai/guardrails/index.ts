/**
 * Guardrails Barrel File
 */

export { AI_WRITING_TELL_RULES, detectWritingTells } from "./writing-tells";
export {
  DIN_5008_EMAIL_STRUCTURE,
  GERMAN_B1_LANGUAGE_RULES,
  GERMAN_WRITING_TELL_RULES,
  detectGermanB1Violations,
} from "./region-language";
export { PROMPT_FENCING_RULES, fenceUntrustedContent } from "./prompt-fencing";
export {
  verifyFactualAccuracy,
  type FactualSourceFacts,
  type FactualCheckResult,
} from "./factual-accuracy";
export {
  generateVerifiedContent,
  type GenerateVerifiedContentArgs,
  type GenerateVerifiedContentResult,
} from "./generate-verified";
export {
  checkPositionLock,
  countNonEmptyLines,
  POSITION_LOCK_RULES,
  type PositionLockCheckResult,
} from "./position-lock";
