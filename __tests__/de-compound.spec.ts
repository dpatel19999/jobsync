import { splitGermanCompound } from "@/lib/ats/adapters/de-compound";

// Synthetic dictionary (not the real ~1MB Hunspell wordlist) so these tests
// are fast and deterministic, and specifically exercise umlaut (ä ö ü) and
// ß handling in the split algorithm itself.
const DICT = new Set([
  "daten",
  "analyse",
  "analysen",
  "software",
  "prüfung",
  "übertragung",
  "straße",
  "größe",
  "entwicklung",
  "projekt",
]);

describe("splitGermanCompound — umlaut and ß handling", () => {
  it("returns an already-known word containing ß unchanged", () => {
    expect(splitGermanCompound("straße", DICT)).toEqual(["straße"]);
  });

  it("returns an already-known word containing ö/ß (Größe) unchanged", () => {
    expect(splitGermanCompound("größe", DICT)).toEqual(["größe"]);
  });

  it("splits a compound whose right part contains ü (Softwareprüfung)", () => {
    expect(splitGermanCompound("softwareprüfung", DICT)).toEqual(["software", "prüfung"]);
  });

  it("splits a compound whose right part contains ü and needs linking-morpheme stripping (Softwareprüfungen)", () => {
    // "prüfungen" isn't in the dict directly — only via stripping the "en" linking suffix to "prüfung".
    expect(splitGermanCompound("softwareprüfungen", DICT)).toEqual(["software", "prüfung"]);
  });

  it("splits a compound whose left part contains ü (Übertragungsdaten-style, reversed)", () => {
    expect(splitGermanCompound("übertragungdaten", DICT)).toEqual(["übertragung", "daten"]);
  });

  it("recurses for a three-part compound containing umlauts (Datenübertragungsprüfung-ish)", () => {
    const dict = new Set([...DICT, "datenübertragung"]);
    const result = splitGermanCompound("datenübertragungprüfung", dict);
    // The algorithm prefers the split with the longest right-hand span, so
    // "daten" + recursively-split "übertragungprüfung" wins over the single
    // split at "datenübertragung" | "prüfung" (right span 18 chars vs 7).
    expect(result).toEqual(["daten", "übertragung", "prüfung"]);
  });

  it("returns the word unchanged when no valid split exists", () => {
    expect(splitGermanCompound("xyzzyunknownword", DICT)).toEqual(["xyzzyunknownword"]);
  });

  it("returns a short word unchanged without attempting to split", () => {
    expect(splitGermanCompound("auto", DICT)).toEqual(["auto"]);
  });

  it("handles an empty string without throwing", () => {
    expect(splitGermanCompound("", DICT)).toEqual([""]);
  });
});
