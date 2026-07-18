import { verifyFactualAccuracy } from "@/lib/ai/guardrails/factual-accuracy";

vi.mock("ai", () => ({ generateText: vi.fn() }));

import { generateText } from "ai";

const FACTS = {
  resumeText: "Backend Engineer at Acme Corp, Node.js, PostgreSQL, AWS.",
  jobText: "Backend Engineer role requiring Node.js and AWS.",
};

describe("verifyFactualAccuracy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified=true when the model reports NONE", async () => {
    (generateText as any).mockResolvedValue({ text: "NONE" });
    const result = await verifyFactualAccuracy({} as any, "clean draft", FACTS);
    expect(result.verified).toBe(true);
    expect(result.unsupportedClaims).toEqual([]);
  });

  it("tolerates whitespace around NONE", async () => {
    (generateText as any).mockResolvedValue({ text: "  none  \n" });
    const result = await verifyFactualAccuracy({} as any, "clean draft", FACTS);
    expect(result.verified).toBe(true);
  });

  it("parses one or more UNSUPPORTED lines into unsupportedClaims", async () => {
    (generateText as any).mockResolvedValue({
      text: "UNSUPPORTED: fake employer\nUNSUPPORTED: fake certification",
    });
    const result = await verifyFactualAccuracy({} as any, "fabricated draft", FACTS);
    expect(result.verified).toBe(false);
    expect(result.unsupportedClaims).toEqual(["fake employer", "fake certification"]);
  });

  it("treats an unparseable response (no NONE, no UNSUPPORTED prefix) as unverified rather than silently passing", async () => {
    (generateText as any).mockResolvedValue({ text: "I'm not sure how to answer this." });
    const result = await verifyFactualAccuracy({} as any, "draft", FACTS);
    expect(result.verified).toBe(false);
    expect(result.unsupportedClaims.length).toBeGreaterThan(0);
  });

  it("ignores blank lines when parsing UNSUPPORTED claims", async () => {
    (generateText as any).mockResolvedValue({
      text: "UNSUPPORTED: claim one\n\nUNSUPPORTED: claim two\n",
    });
    const result = await verifyFactualAccuracy({} as any, "draft", FACTS);
    expect(result.unsupportedClaims).toEqual(["claim one", "claim two"]);
  });
});
