import { describe, expect, it } from "vitest";
import {
  COLD_EMAIL_TEMPLATE,
  fillColdEmailTemplate,
} from "@/lib/coldEmailTemplate";

describe("COLD_EMAIL_TEMPLATE", () => {
  it("contains the German section, the 'English version;' separator, and the English section", () => {
    expect(COLD_EMAIL_TEMPLATE).toContain("Sehr geehrtes Personalteam,");
    expect(COLD_EMAIL_TEMPLATE).toContain("English version;");
    expect(COLD_EMAIL_TEMPLATE).toContain("Dear Hiring Team,");
    // German section appears before the separator, English section after.
    const separatorIndex = COLD_EMAIL_TEMPLATE.indexOf("English version;");
    expect(
      COLD_EMAIL_TEMPLATE.indexOf("Sehr geehrtes Personalteam,"),
    ).toBeLessThan(separatorIndex);
    expect(COLD_EMAIL_TEMPLATE.indexOf("Dear Hiring Team,")).toBeGreaterThan(
      separatorIndex,
    );
  });

  it("preserves the differing German/English sign-offs verbatim", () => {
    expect(COLD_EMAIL_TEMPLATE).toContain("Mit freundlichen Grüßen\n\nDhruvil\n");
    expect(COLD_EMAIL_TEMPLATE).toContain("Sincerely,\n\nDhruvil Akbari\n");
  });

  it("has both placeholders present multiple times before filling", () => {
    expect(COLD_EMAIL_TEMPLATE.split("[Job Title]").length - 1).toBe(2);
    expect(COLD_EMAIL_TEMPLATE.split("[Company Name]").length - 1).toBe(6);
  });
});

describe("fillColdEmailTemplate", () => {
  it("substitutes both placeholders everywhere in both language sections", () => {
    const filled = fillColdEmailTemplate("Backend Engineer", "Acme GmbH");

    expect(filled).not.toContain("[Job Title]");
    expect(filled).not.toContain("[Company Name]");
    expect(filled.split("Backend Engineer").length - 1).toBe(2);
    expect(filled.split("Acme GmbH").length - 1).toBe(6);

    // Present in the German section (before the separator)...
    const separatorIndex = filled.indexOf("English version;");
    const germanSection = filled.slice(0, separatorIndex);
    const englishSection = filled.slice(separatorIndex);
    expect(germanSection).toContain(
      "Interesse an der Stelle als Backend Engineer bei Acme GmbH",
    );
    // ...and in the English section (after the separator).
    expect(englishSection).toContain(
      "interest in the Backend Engineer position at Acme GmbH",
    );
  });

  it("does not mutate the exported template constant", () => {
    const before = COLD_EMAIL_TEMPLATE;
    fillColdEmailTemplate("X", "Y");
    expect(COLD_EMAIL_TEMPLATE).toBe(before);
  });
});
