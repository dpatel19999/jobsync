import { detectWritingTells, AI_WRITING_TELL_RULES } from "@/lib/ai/guardrails/writing-tells";

describe("detectWritingTells", () => {
  it("returns no hits for empty string", () => {
    expect(detectWritingTells("")).toEqual([]);
  });

  it("flags 'not just X, it's Y' framing", () => {
    const hits = detectWritingTells("This isn't just a job, it's a calling.");
    expect(hits.some((h) => h.rule === "not-just-x-its-y")).toBe(true);
  });

  it("flags em-dash overuse (more than one)", () => {
    const hits = detectWritingTells("I work hard — every day — without fail.");
    expect(hits.some((h) => h.rule === "em-dash-overuse")).toBe(true);
  });

  it("does not flag a single em-dash", () => {
    const hits = detectWritingTells("I work hard — every day.");
    expect(hits.some((h) => h.rule === "em-dash-overuse")).toBe(false);
  });

  it("flags Furthermore/Moreover/Additionally as formal transition openers", () => {
    expect(
      detectWritingTells("Furthermore, I have experience.").some(
        (h) => h.rule === "formal-transition-opener"
      )
    ).toBe(true);
    expect(
      detectWritingTells("Moreover, I have experience.").some(
        (h) => h.rule === "formal-transition-opener"
      )
    ).toBe(true);
  });

  it("flags rule-of-three adjective stacking", () => {
    const hits = detectWritingTells("I bring innovative, scalable, and robust solutions.");
    expect(hits.some((h) => h.rule === "rule-of-three-adjective-stack")).toBe(true);
  });

  it("flags inflated-significance closers", () => {
    const hits = detectWritingTells("I would be thrilled to join your team.");
    expect(hits.some((h) => h.rule === "inflated-significance-closer")).toBe(true);
  });

  it("flags buzzword filler", () => {
    const hits = detectWritingTells("I am a passionate, results-driven engineer.");
    expect(hits.some((h) => h.rule === "buzzword-filler")).toBe(true);
  });

  it("returns no hits for clean, plain hand-written text", () => {
    const clean =
      "I've spent the last three years building shipment-tracking APIs in Node.js. Your Berlin team's AWS work looks like a strong match. Would you be open to a short call this week?";
    expect(detectWritingTells(clean)).toEqual([]);
  });
});

describe("AI_WRITING_TELL_RULES", () => {
  it("is a non-empty prompt fragment", () => {
    expect(AI_WRITING_TELL_RULES.length).toBeGreaterThan(50);
    expect(AI_WRITING_TELL_RULES).toContain("AI TELLS");
  });
});
