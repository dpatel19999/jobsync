"use client";

import { useEffect, useState } from "react";
import { getTemplateForJobLanguage } from "@/actions/templates.actions";
import { TemplateKind, type MasterTemplateSummary } from "@/models/template.model";

type TemplateAvailabilityNoteProps = {
  kind: TemplateKind;
  language?: string | null;
};

const KIND_LABEL: Record<TemplateKind, string> = {
  [TemplateKind.RESUME]: "resume",
  [TemplateKind.COVER_LETTER]: "cover letter",
};

// Job-detail-page indicator: if the job's language is known but no matching
// master template has been uploaded for it, say so explicitly rather than
// silently falling back to the wrong language later at generation time.
export function TemplateAvailabilityNote({
  kind,
  language,
}: TemplateAvailabilityNoteProps) {
  const [template, setTemplate] = useState<MasterTemplateSummary | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!language) {
      setChecked(false);
      return;
    }
    let cancelled = false;
    setChecked(false);
    getTemplateForJobLanguage(kind, language).then((result) => {
      if (cancelled) return;
      setTemplate(result.success ? (result.data ?? null) : null);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, language]);

  if (!language || !checked) return null;

  const langLabel = language === "de" ? "German" : "English";

  if (!template) {
    return (
      <p
        className="text-xs text-amber-600 dark:text-amber-500"
        data-testid={`template-missing-${kind.toLowerCase()}`}
      >
        No {langLabel} {KIND_LABEL[kind]} template uploaded yet.
      </p>
    );
  }

  return (
    <p
      className="text-xs text-muted-foreground"
      data-testid={`template-available-${kind.toLowerCase()}`}
    >
      Using {langLabel} {KIND_LABEL[kind]} template: {template.fileName}
    </p>
  );
}
