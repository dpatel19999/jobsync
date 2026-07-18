/**
 * Shared Text Processing Utilities
 * Used by both resume and job preprocessing modules
 * Extracted from preprocessing.ts to enable code reuse
 */

// HTML AND WHITESPACE NORMALIZATION

export const removeHtmlTags = (description: string | undefined): string => {
  if (!description) return "";

  return description
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(li|p|div|br)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
};

export const normalizeWhitespace = (text: string): string => {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const normalizeBullets = (text: string): string => {
  return text
    .replace(/[•●○◦▪▸►◆★✦✓✔→‣⁃]/g, "•")
    .replace(/^[-–—]\s/gm, "• ")
    .replace(/^\*\s/gm, "• ");
};

export const normalizeHeadings = (text: string): string => {
  return text
    .replace(/^([A-Z][A-Z\s&]+):?\s*$/gm, (_match, heading) => {
      const normalized = heading.trim().replace(/:$/, "");
      return `\n${normalized}\n`;
    })
    .replace(/\n{3,}/g, "\n\n");
};

// METADATA EXTRACTION

export interface TextMetadata {
  characterCount: number;
  wordCount: number;
  lineCount: number;
  hasContactInfo: boolean;
}

export const extractMetadata = (text: string): TextMetadata => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines = text.split("\n");

  return {
    characterCount: text.length,
    wordCount: words.length,
    lineCount: lines.length,
    hasContactInfo: hasContactPatterns(text),
  };
};

// Contact info always appears near the top of a resume/job posting, so
// scanning a bounded prefix is enough — and necessary: emailPattern's
// [\w.-]+@ against a long run of text with no "@" backtracks quadratically
// (confirmed: ~6s on a 60,000-char run with no match), which would block
// the event loop on any sufficiently long paste. The cap keeps worst-case
// regex time constant regardless of overall document length.
const CONTACT_SCAN_LIMIT = 2000;

const hasContactPatterns = (text: string): boolean => {
  const scanText = text.slice(0, CONTACT_SCAN_LIMIT);
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/;
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  return emailPattern.test(scanText) || phonePattern.test(scanText);
};

// VALIDATION HELPERS

export interface ValidationError {
  code: string;
  message: string;
  details?: object;
}

export interface ValidationResult {
  isValid: boolean;
  error?: ValidationError;
}

/**
 * Generic text validation - checks for empty content and basic corruption
 * @param text - Text to validate
 * @param minCharCount - Minimum character count required
 * @param maxCharCount - Maximum character count allowed
 * @param contextLabel - Label for error messages (e.g., "Resume", "Job description")
 */
export const validateText = (
  text: string,
  minCharCount: number = 200,
  maxCharCount: number = 50000,
  contextLabel: string = "Content",
): ValidationResult => {
  // Check for empty content
  if (!text || text.trim().length === 0) {
    return {
      isValid: false,
      error: {
        code: "NO_CONTENT",
        message: `${contextLabel} appears to be empty or contains only whitespace`,
      },
    };
  }

  // Check minimum length
  if (text.length < minCharCount) {
    return {
      isValid: false,
      error: {
        code: "TOO_SHORT",
        message: `${contextLabel} is too short. Found ${text.length} characters, minimum required: ${minCharCount} characters.`,
        details: {
          characterCount: text.length,
          minCharCount,
        },
      },
    };
  }

  // Check maximum length
  if (text.length > maxCharCount) {
    return {
      isValid: false,
      error: {
        code: "TOO_LONG",
        message: `${contextLabel} is too long. Found ${text.length} characters, maximum allowed: ${maxCharCount} characters.`,
        details: {
          characterCount: text.length,
          maxCharCount,
        },
      },
    };
  }

  // Check for corruption - consecutive special characters
  const MAX_CONSECUTIVE_SPECIAL_CHARS = 20;
  const specialCharPattern = new RegExp(
    `[^a-zA-Z0-9\\s]{${MAX_CONSECUTIVE_SPECIAL_CHARS + 1},}`,
  );
  if (specialCharPattern.test(text)) {
    return {
      isValid: false,
      error: {
        code: "CORRUPTED",
        message: `${contextLabel} appears to be corrupted. Found excessive consecutive special characters.`,
        details: {
          maxConsecutiveSpecialChars: MAX_CONSECUTIVE_SPECIAL_CHARS,
        },
      },
    };
  }

  return { isValid: true };
};
