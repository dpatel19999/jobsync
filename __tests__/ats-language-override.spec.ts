import { scoreResumeAgainstKeywords } from "@/lib/ats";

// Deliberately German-sounding resume/JD text with the languageOverride
// forced to "en" — proves the override short-circuits detectAtsLanguage
// (and thus that a persisted Job.language skips re-detection end to end,
// not just at the action layer already covered in job.actions.spec.ts).
const GERMAN_RESUME = "Erfahrung mit Node.js, PostgreSQL und AWS Diensten.";
const GERMAN_JD = "Wir suchen einen Backend-Entwickler mit Node.js Erfahrung.";

describe("scoreResumeAgainstKeywords — language override", () => {
  it("uses the provided languageOverride instead of detecting from the job text", async () => {
    const result = await scoreResumeAgainstKeywords(
      GERMAN_RESUME,
      ["Node.js"],
      GERMAN_JD,
      "en",
    );
    expect(result.language).toBe("en");
  });

  it("still uses the German adapter when languageOverride is 'de'", async () => {
    const result = await scoreResumeAgainstKeywords(
      GERMAN_RESUME,
      ["Node.js"],
      GERMAN_JD,
      "de",
    );
    expect(result.language).toBe("de");
  });

  it("falls back to detection when no override is given", async () => {
    const result = await scoreResumeAgainstKeywords(
      GERMAN_RESUME,
      ["Node.js"],
      GERMAN_JD,
    );
    expect(result.language).toBe("de");
  });
});
