export type AtsLanguage = "en" | "de";

export interface AtsLanguageAdapter {
  language: AtsLanguage;
  /** Tokenize + normalize (stem, decompose compounds, etc.) into match tokens. */
  tokenize(text: string): Promise<string[]>;
}
