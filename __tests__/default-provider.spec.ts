vi.mock("server-only", () => ({}));

import { PrismaClient } from "@prisma/client";
import { resolveDefaultAi } from "@/lib/ai/default-provider";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL } from "@/lib/ai/config";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const mPrismaClient = {
    userSettings: { findUnique: vi.fn() },
  };
  return { PrismaClient: vi.fn(function () { return mPrismaClient; }) };
});

describe("resolveDefaultAi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to Gemini when no UserSettings row exists at all", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue(null);
    const result = await resolveDefaultAi("user-1");
    expect(result).toEqual({ provider: "gemini", model: DEFAULT_GEMINI_MODEL });
  });

  it("defaults to Gemini when a UserSettings row exists but has no saved ai.provider (e.g. only display settings were ever saved)", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      settings: JSON.stringify({ display: { theme: "dark" } }),
    });
    const result = await resolveDefaultAi("user-1");
    expect(result).toEqual({ provider: "gemini", model: DEFAULT_GEMINI_MODEL });
  });

  it("honors an explicitly saved Ollama provider + model", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      settings: JSON.stringify({ ai: { provider: "ollama", model: "llama3.1" } }),
    });
    const result = await resolveDefaultAi("user-1");
    expect(result).toEqual({ provider: "ollama", model: "llama3.1" });
  });

  it("falls back to the Ollama default model when a saved Ollama preference omits the model", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      settings: JSON.stringify({ ai: { provider: "ollama" } }),
    });
    const result = await resolveDefaultAi("user-1");
    expect(result).toEqual({ provider: "ollama", model: DEFAULT_OLLAMA_MODEL });
  });

  it("honors an explicitly saved non-Ollama, non-Gemini provider (e.g. openai) with its saved model", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      settings: JSON.stringify({ ai: { provider: "openai", model: "gpt-4o-mini" } }),
    });
    const result = await resolveDefaultAi("user-1");
    expect(result).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });
});
