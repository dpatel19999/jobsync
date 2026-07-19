vi.mock("server-only", () => ({}));

const { getModelMock } = vi.hoisted(() => ({ getModelMock: vi.fn() }));
vi.mock("@/lib/ai/providers", () => ({ getModel: getModelMock }));

import { PrismaClient } from "@prisma/client";
import {
  resolveDefaultAi,
  isGeminiQuotaError,
  callWithGeminiFallback,
} from "@/lib/ai/default-provider";
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

describe("isGeminiQuotaError", () => {
  it("detects a 429 statusCode directly on the error (APICallError shape)", () => {
    const err = Object.assign(new Error("boom"), { statusCode: 429 });
    expect(isGeminiQuotaError(err)).toBe(true);
  });

  it("detects a 429 statusCode nested under lastError (RetryError shape)", () => {
    const err = Object.assign(new Error("Failed after 3 attempts"), {
      lastError: { statusCode: 429 },
    });
    expect(isGeminiQuotaError(err)).toBe(true);
  });

  it("detects 'quota' in the message even without a statusCode", () => {
    const err = new Error(
      "You exceeded your current quota, please check your plan and billing details.",
    );
    expect(isGeminiQuotaError(err)).toBe(true);
  });

  it("detects RESOURCE_EXHAUSTED in the message", () => {
    const err = new Error('Request failed: {"status":"RESOURCE_EXHAUSTED"}');
    expect(isGeminiQuotaError(err)).toBe(true);
  });

  it("returns false for an unrelated error", () => {
    expect(isGeminiQuotaError(new Error("Network timeout"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isGeminiQuotaError("plain string")).toBe(false);
    expect(isGeminiQuotaError(undefined)).toBe(false);
  });
});

describe("callWithGeminiFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the result from the resolved provider without falling back when the call succeeds", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue(null); // -> gemini default
    getModelMock.mockResolvedValue({ modelId: "gemini-model" });
    const run = vi.fn().mockResolvedValue("ok");

    const { result, providerUsed, usedOfflineFallback } = await callWithGeminiFallback("user-1", run);

    expect(result).toBe("ok");
    expect(providerUsed).toBe("gemini");
    expect(usedOfflineFallback).toBe(false);
    expect(run).toHaveBeenCalledWith({ modelId: "gemini-model" }, "gemini");
    expect(getModelMock).toHaveBeenCalledWith("gemini", DEFAULT_GEMINI_MODEL, "user-1");
  });

  it("falls back to Ollama and retries once when the Gemini call fails with a quota error", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue(null);
    getModelMock
      .mockResolvedValueOnce({ modelId: "gemini-model" })
      .mockResolvedValueOnce({ modelId: "ollama-model" });
    const quotaError = Object.assign(new Error("quota exceeded"), { statusCode: 429 });
    const run = vi
      .fn()
      .mockRejectedValueOnce(quotaError)
      .mockResolvedValueOnce("fallback-ok");

    const { result, providerUsed, usedOfflineFallback } = await callWithGeminiFallback("user-1", run);

    expect(result).toBe("fallback-ok");
    expect(providerUsed).toBe("ollama");
    expect(usedOfflineFallback).toBe(true);
    expect(run).toHaveBeenNthCalledWith(1, { modelId: "gemini-model" }, "gemini");
    expect(run).toHaveBeenNthCalledWith(2, { modelId: "ollama-model" }, "ollama");
    expect(getModelMock).toHaveBeenNthCalledWith(2, "ollama", DEFAULT_OLLAMA_MODEL, "user-1");
  });

  it("does not fall back and rethrows when the error is not a quota error", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue(null);
    getModelMock.mockResolvedValue({ modelId: "gemini-model" });
    const otherError = new Error("Network timeout");
    const run = vi.fn().mockRejectedValue(otherError);

    await expect(callWithGeminiFallback("user-1", run)).rejects.toThrow("Network timeout");
    expect(getModelMock).toHaveBeenCalledTimes(1); // never retried
  });

  it("does not fall back when the user explicitly chose Ollama and that call fails with a quota-like error", async () => {
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      settings: JSON.stringify({ ai: { provider: "ollama", model: "llama3.1" } }),
    });
    getModelMock.mockResolvedValue({ modelId: "ollama-model" });
    const quotaError = Object.assign(new Error("quota exceeded"), { statusCode: 429 });
    const run = vi.fn().mockRejectedValue(quotaError);

    await expect(callWithGeminiFallback("user-1", run)).rejects.toThrow("quota exceeded");
    expect(getModelMock).toHaveBeenCalledTimes(1); // never retried — not Gemini in the first place
  });
});
