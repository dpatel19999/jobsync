// Master resume/cover-letter templates — see prisma schema's MasterTemplate
// model and DECISIONS.md for the four-slot / versioning design.

export enum TemplateKind {
  RESUME = "RESUME",
  COVER_LETTER = "COVER_LETTER",
}

export type TemplateLanguage = "EN" | "DE";

export enum TemplateSlot {
  RESUME_EN = "RESUME_EN",
  RESUME_DE = "RESUME_DE",
  COVER_LETTER_EN = "COVER_LETTER_EN",
  COVER_LETTER_DE = "COVER_LETTER_DE",
}

export const TEMPLATE_SLOTS: TemplateSlot[] = [
  TemplateSlot.RESUME_EN,
  TemplateSlot.RESUME_DE,
  TemplateSlot.COVER_LETTER_EN,
  TemplateSlot.COVER_LETTER_DE,
];

export const TEMPLATE_SLOT_LABELS: Record<TemplateSlot, string> = {
  [TemplateSlot.RESUME_EN]: "Resume — English",
  [TemplateSlot.RESUME_DE]: "Resume — German",
  [TemplateSlot.COVER_LETTER_EN]: "Cover Letter — English",
  [TemplateSlot.COVER_LETTER_DE]: "Cover Letter — German",
};

export function templateSlotFor(
  kind: TemplateKind,
  language: TemplateLanguage,
): TemplateSlot {
  return `${kind}_${language}` as TemplateSlot;
}

// Job.language is persisted lowercase ("en" | "de"); template slots use
// uppercase suffixes — this is the single place that bridges the two.
export function languageToTemplateLanguage(
  language: string | null | undefined,
): TemplateLanguage | null {
  if (language === "en" || language === "de") {
    return language.toUpperCase() as TemplateLanguage;
  }
  return null;
}

export type MasterTemplateSummary = {
  id: string;
  slot: TemplateSlot;
  version: number;
  fileName: string;
  createdAt: Date;
};
