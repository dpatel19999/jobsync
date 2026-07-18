import { franc } from "franc-min";
import type { AtsLanguage } from "./adapters/types";

/**
 * Lightweight EN/DE detection for the job description text. There's no
 * `language`/`region` field on the Job model yet — that's planned for a
 * later DIN-formatting/B1-German phase (see ARCHITECTURE.md) and
 * deliberately not built out here. This just picks an adapter for today.
 */
export function detectAtsLanguage(text: string): AtsLanguage {
  const code = franc(text, { only: ["eng", "deu"] });
  return code === "deu" ? "de" : "en";
}
