import { franc } from "franc-min";
import type { AtsLanguage } from "./adapters/types";

/**
 * Lightweight EN/DE detection for the job description text. Called once per
 * job (via resolveJobLanguage in job.actions.ts) and the result persisted to
 * Job.language; this function itself stays a stateless one-shot detector.
 */
export function detectAtsLanguage(text: string): AtsLanguage {
  const code = franc(text, { only: ["eng", "deu"] });
  return code === "deu" ? "de" : "en";
}
