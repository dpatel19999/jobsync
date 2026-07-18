import { newStemmer } from "snowball-stemmers";
import type { AtsLanguageAdapter } from "./types";
import { getGermanWordSet } from "./de-dictionary";
import { splitGermanCompound } from "./de-compound";

const stemmer = newStemmer("german");

// Keep umlauts and ß; German words don't use apostrophes/hyphens the way
// English compounding does here (hyphenated compounds are split on the
// hyphen itself, each side handled independently).
const WORD_PATTERN = /[A-Za-zÄÖÜäöüß]+/g;

export async function tokenizeGerman(text: string): Promise<string[]> {
  const dict = await getGermanWordSet();
  const words = (text.match(WORD_PATTERN) ?? []).map((w) => w.toLowerCase());

  const tokens: string[] = [];
  for (const word of words) {
    if (word.length < 2) continue;

    // For anything long enough to plausibly be a compound, decompose and
    // require each sub-part's stem instead of the whole-word stem — using
    // both would over-constrain the match, since a resume's inflected form
    // of the same word (e.g. plural) may not decompose identically. Only
    // fall back to the whole-word stem when no split is found.
    const parts = word.length >= 8 ? splitGermanCompound(word, dict) : [word];
    if (parts.length > 1) {
      for (const part of parts) {
        tokens.push(stemmer.stem(part));
      }
    } else {
      tokens.push(stemmer.stem(word));
    }
  }

  return tokens;
}

export const germanAdapter: AtsLanguageAdapter = {
  language: "de",
  tokenize: tokenizeGerman,
};
