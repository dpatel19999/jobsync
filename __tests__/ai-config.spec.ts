import { truncateForProvider, TEXT_LIMITS } from "@/lib/ai/config";

describe("truncateForProvider", () => {
  it("does not truncate text under the limit", () => {
    const text = "short text";
    expect(truncateForProvider(text, "ollama", "JOB")).toBe(text);
  });

  it("truncates job text over the Ollama limit", () => {
    const text = "A".repeat(TEXT_LIMITS.OLLAMA.JOB + 500);
    const result = truncateForProvider(text, "ollama", "JOB");
    expect(result.length).toBe(TEXT_LIMITS.OLLAMA.JOB);
  });

  it("truncates resume text over the Ollama limit", () => {
    const text = "A".repeat(TEXT_LIMITS.OLLAMA.RESUME + 500);
    const result = truncateForProvider(text, "ollama", "RESUME");
    expect(result.length).toBe(TEXT_LIMITS.OLLAMA.RESUME);
  });

  it("uses the higher cloud-provider limit for non-ollama providers", () => {
    const text = "A".repeat(TEXT_LIMITS.OLLAMA.JOB + 500);
    const result = truncateForProvider(text, "openai", "JOB");
    // Under the cloud limit, so should be left untouched even though it
    // exceeds the (smaller) Ollama limit.
    expect(result.length).toBe(text.length);
  });

  it("truncates cloud-provider text over the cloud limit too", () => {
    const text = "A".repeat(TEXT_LIMITS.CLOUD.JOB + 500);
    const result = truncateForProvider(text, "openai", "JOB");
    expect(result.length).toBe(TEXT_LIMITS.CLOUD.JOB);
  });

  it("handles an empty string", () => {
    expect(truncateForProvider("", "ollama", "JOB")).toBe("");
  });
});
