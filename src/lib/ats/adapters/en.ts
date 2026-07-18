import { newStemmer } from "snowball-stemmers";
import type { AtsLanguageAdapter } from "./types";

const stemmer = newStemmer("english");

const WORD_PATTERN = /[A-Za-z][A-Za-z'-]*/g;

export async function tokenizeEnglish(text: string): Promise<string[]> {
  const words = text.match(WORD_PATTERN) ?? [];
  return words
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1)
    .map((w) => stemmer.stem(w));
}

export const englishAdapter: AtsLanguageAdapter = {
  language: "en",
  tokenize: tokenizeEnglish,
};
