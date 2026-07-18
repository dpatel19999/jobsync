import { detectAtsLanguage } from "@/lib/ats/language-detect";

const ENGLISH_JD = `We are looking for a Backend Engineer to join our platform team. You will work with Node.js, PostgreSQL, and AWS to build scalable services. Experience with Docker and REST API design is a plus. This is a full-time position based in our downtown office with flexible working hours.`;

const GERMAN_JD = `Wir suchen einen Backend-Entwickler fuer unser Plattform-Team. Sie arbeiten mit Node.js, PostgreSQL und AWS an skalierbaren Diensten. Erfahrung mit Docker und REST-API-Design ist von Vorteil. Diese Stelle ist in Vollzeit und befindet sich in unserem Buero in Berlin.`;

// French — neither English nor German. detectAtsLanguage restricts franc to
// only ["eng","deu"] candidates, so it will always force a pick between the
// two rather than return "unknown" — there's no third value in the type.
const FRENCH_JD = `Nous recherchons un ingenieur backend pour rejoindre notre equipe de plateforme. Vous travaillerez avec Node.js, PostgreSQL et AWS pour construire des services evolutifs. Une experience avec Docker et la conception d'API REST est un plus. Ce poste est a temps plein et se trouve dans notre bureau du centre-ville.`;

describe("detectAtsLanguage", () => {
  it("detects English text as 'en'", () => {
    expect(detectAtsLanguage(ENGLISH_JD)).toBe("en");
  });

  it("detects German text as 'de'", () => {
    expect(detectAtsLanguage(GERMAN_JD)).toBe("de");
  });

  it("does not throw on non-English/non-German text and forces a fallback pick", () => {
    // Documented, intentional behavior (see DECISIONS.md / ARCHITECTURE.md):
    // the app only has EN/DE adapters, so a third language is forced into
    // whichever of the two franc considers closer rather than crashing or
    // returning an "unknown" the rest of the pipeline can't handle.
    let result: string | undefined;
    expect(() => {
      result = detectAtsLanguage(FRENCH_JD);
    }).not.toThrow();
    expect(["en", "de"]).toContain(result);
  });

  it("does not throw on an empty string", () => {
    expect(() => detectAtsLanguage("")).not.toThrow();
    expect(["en", "de"]).toContain(detectAtsLanguage(""));
  });
});
