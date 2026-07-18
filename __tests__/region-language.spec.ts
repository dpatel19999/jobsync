import {
  detectGermanB1Violations,
  GERMAN_WRITING_TELL_RULES,
  DIN_5008_EMAIL_STRUCTURE,
  GERMAN_B1_LANGUAGE_RULES,
} from "@/lib/ai/guardrails/region-language";
import { AI_WRITING_TELL_RULES } from "@/lib/ai/guardrails/writing-tells";

describe("detectGermanB1Violations", () => {
  it("returns no hits for empty string", () => {
    expect(detectGermanB1Violations("")).toEqual([]);
  });

  it("flags Konjunktiv II markers (würde/hätte/wäre/könnte)", () => {
    const hits = detectGermanB1Violations(
      "Ich würde mich freuen, wenn wir uns unterhalten könnten."
    );
    const hit = hits.find((h) => h.rule === "konjunktiv-ii");
    expect(hit).toBeDefined();
    expect(hit!.excerpt).toContain("würde");
    expect(hit!.excerpt).toContain("könnten");
  });

  it("flags a sentence longer than ~25 words", () => {
    const longSentence =
      "Ich bin sehr an dieser Stelle interessiert weil ich glaube dass meine Erfahrung mit Node.js TypeScript PostgreSQL und AWS sehr gut zu den Anforderungen der Stelle passt und ich mich sehr auf ein Gespraech freuen wuerde.";
    const hits = detectGermanB1Violations(longSentence);
    expect(hits.some((h) => h.rule === "sentence-too-long-for-b1")).toBe(true);
  });

  it("does not flag a short, direct sentence", () => {
    const hits = detectGermanB1Violations("Ich habe drei Jahre Erfahrung mit Node.js.");
    expect(hits).toEqual([]);
  });

  it("flags 'nicht nur X sondern auch Y' framing", () => {
    const hits = detectGermanB1Violations(
      "Ich bin nicht nur Entwickler, sondern auch Teamplayer."
    );
    expect(hits.some((h) => h.rule === "nicht-nur-x-sondern-auch-y")).toBe(true);
  });
});

describe("GERMAN_WRITING_TELL_RULES", () => {
  it("extends AI_WRITING_TELL_RULES rather than duplicating it", () => {
    expect(GERMAN_WRITING_TELL_RULES).toContain(AI_WRITING_TELL_RULES);
    expect(GERMAN_WRITING_TELL_RULES).toContain("GERMAN-SPECIFIC ADDITIONS");
  });
});

describe("DIN_5008_EMAIL_STRUCTURE", () => {
  it("mentions the required structural elements", () => {
    expect(DIN_5008_EMAIL_STRUCTURE).toContain("Betreff");
    expect(DIN_5008_EMAIL_STRUCTURE).toContain("Sehr geehrte Damen und Herren");
    expect(DIN_5008_EMAIL_STRUCTURE).toContain("Mit freundlichen Grüßen");
    expect(DIN_5008_EMAIL_STRUCTURE).toContain("Sie");
  });
});

describe("GERMAN_B1_LANGUAGE_RULES", () => {
  it("mentions the B1 constraints from CLAUDE.md", () => {
    expect(GERMAN_B1_LANGUAGE_RULES).toContain("Konjunktiv II");
    expect(GERMAN_B1_LANGUAGE_RULES).toMatch(/15-20 words/);
    expect(GERMAN_B1_LANGUAGE_RULES).toContain("idiom");
  });
});
