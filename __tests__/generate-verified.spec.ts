import { generateVerifiedContent } from "@/lib/ai/guardrails/generate-verified";

vi.mock("ai", () => ({ generateText: vi.fn() }));

import { generateText } from "ai";

const FACTS = {
  resumeText: "Backend Engineer at Acme Corp, Node.js, PostgreSQL, AWS.",
  jobText: "Backend Engineer role requiring Node.js and AWS.",
};

const BASE_ARGS = {
  model: {} as any,
  system: "system prompt",
  prompt: "user prompt",
  temperature: 0.3,
  facts: FACTS,
};

describe("generateVerifiedContent", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns verified content on the first try when the fact-check passes immediately", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "a clean draft" }) // generation
      .mockResolvedValueOnce({ text: "NONE" }); // fact-check

    const result = await generateVerifiedContent(BASE_ARGS);

    expect(result.content).toBe("a clean draft");
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.warning).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("regenerates once on a failed fact-check, and succeeds if the retry passes", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "draft with a fake claim" }) // generation 1
      .mockResolvedValueOnce({ text: "UNSUPPORTED: fake claim" }) // fact-check 1
      .mockResolvedValueOnce({ text: "corrected draft" }) // generation 2
      .mockResolvedValueOnce({ text: "NONE" }); // fact-check 2

    const result = await generateVerifiedContent(BASE_ARGS);

    expect(result.content).toBe("corrected draft");
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.warning).toBeNull();

    // The regenerate call's prompt should include the unsupported claim so
    // the model knows what to fix.
    const secondGenerationCall = (generateText as any).mock.calls[2][0];
    expect(secondGenerationCall.prompt).toContain("fake claim");
  });

  it("surfaces a non-null warning instead of silently returning unverified content when still failing after the retry", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "draft 1" })
      .mockResolvedValueOnce({ text: "UNSUPPORTED: claim A" })
      .mockResolvedValueOnce({ text: "draft 2" })
      .mockResolvedValueOnce({ text: "UNSUPPORTED: claim A" });

    const result = await generateVerifiedContent(BASE_ARGS);

    expect(result.verified).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.content).toBe("draft 2"); // still returns content, doesn't discard it
    expect(result.warning).not.toBeNull();
    expect(result.warning).toContain("claim A");
  });

  it("logs a soft writing-tell warning (not blocking) when the content contains a known cliche", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "I would be thrilled to join your team." })
      .mockResolvedValueOnce({ text: "NONE" });

    const result = await generateVerifiedContent(BASE_ARGS);

    expect(result.verified).toBe(true); // soft check never blocks
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("writing-guardrails"));
  });

  it("does not log a writing-tell warning for clean content", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "Clean, direct sentence about real experience." })
      .mockResolvedValueOnce({ text: "NONE" });

    await generateVerifiedContent(BASE_ARGS);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("runs the German B1 soft-check only when language is 'de'", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "Ich würde mich freuen, wenn wir uns unterhalten könnten." })
      .mockResolvedValueOnce({ text: "NONE" });

    await generateVerifiedContent({ ...BASE_ARGS, language: "de" });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("German B1"));
  });

  it("does not run the German B1 soft-check when language is 'en' (default)", async () => {
    (generateText as any)
      .mockResolvedValueOnce({ text: "Ich würde mich freuen, wenn wir uns unterhalten könnten." })
      .mockResolvedValueOnce({ text: "NONE" });

    await generateVerifiedContent(BASE_ARGS);

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("German B1"));
  });
});
