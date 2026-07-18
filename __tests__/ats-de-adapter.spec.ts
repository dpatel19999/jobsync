import { tokenizeGerman } from "@/lib/ats/adapters/de";

// Integration-style test against the REAL Hunspell dictionary (dictionary-de),
// unlike de-compound.spec.ts's synthetic-dict unit tests — confirms the
// umlaut/ß word pattern and real dictionary loading work together end to end.
describe("tokenizeGerman (real dictionary)", () => {
  it("tokenizes German text with umlauts and ß without throwing", async () => {
    const text = "Softwareentwicklung mit Datenübertragung und Straße Größe Prüfung";
    const tokens = await tokenizeGerman(text);
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) {
      expect(t).toBe(t.toLowerCase());
    }
  });

  it("handles an empty string", async () => {
    const tokens = await tokenizeGerman("");
    expect(tokens).toEqual([]);
  });

  it("filters out single-character tokens", async () => {
    const tokens = await tokenizeGerman("a I ß Prüfung");
    expect(tokens).not.toContain("a");
  });
});
