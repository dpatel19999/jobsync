/**
 * AI Prompts - Main Barrel File
 *
 * Re-exports from feature-specific modules for backward compatibility.
 * For new code, import directly from the specific module:
 *   - ./resume-review for resume analysis prompts
 *   - ./job-match for job matching prompts
 */

// Resume Review exports
export {
  RESUME_REVIEW_SYSTEM_PROMPT,
  buildResumeReviewPrompt,
} from "./resume-review";

// Job Match exports
export {
  JOB_MATCH_SYSTEM_PROMPT,
  buildJobMatchPrompt,
} from "./job-match";

// Automation Job Match exports (lean variant for automation loops)
export {
  AUTOMATION_JOB_MATCH_SYSTEM_PROMPT,
  buildAutomationJobMatchPrompt,
} from "./automation-match";

// Resume Import exports
export {
  RESUME_IMPORT_SYSTEM_PROMPT,
  buildResumeImportPrompt,
} from "./resume-import";

// Cold Email exports (EN + DE)
export {
  COLD_EMAIL_SYSTEM_PROMPT,
  buildColdEmailPrompt,
  COLD_EMAIL_SYSTEM_PROMPT_DE,
  buildColdEmailPromptDe,
} from "./cold-email";

// ATS Keyword Extraction exports
export {
  ATS_KEYWORDS_SYSTEM_PROMPT,
  buildAtsKeywordsPrompt,
} from "./ats-keywords";

// Cover Letter exports (EN + DE)
export {
  COVER_LETTER_SYSTEM_PROMPT,
  buildCoverLetterPrompt,
  COVER_LETTER_SYSTEM_PROMPT_DE,
  buildCoverLetterPromptDe,
} from "./cover-letter";

// Tailored Resume Summary exports (EN + DE)
export {
  TAILORED_SUMMARY_SYSTEM_PROMPT,
  buildTailoredSummaryPrompt,
  TAILORED_SUMMARY_SYSTEM_PROMPT_DE,
  buildTailoredSummaryPromptDe,
} from "./tailored-summary";
