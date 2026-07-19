import "server-only";

import prisma from "@/lib/db";
import { AiProvider } from "@/models/ai.model";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL } from "@/lib/ai/config";
import { getModel } from "@/lib/ai/providers";

/**
 * Shared default-provider resolution for every AI generation action (ATS
 * keyword extraction, tailored summary, cover letter, cold email): defaults
 * to Gemini (cloud, fast, no local RAM footprint) unless the user has
 * explicitly saved a provider in AI Settings — e.g. switching to Ollama for
 * offline/no-cloud use. Ollama is never triggered by a default flow; it only
 * runs if a user's saved settings explicitly name it.
 */
export async function resolveDefaultAi(
  userId: string,
): Promise<{ provider: AiProvider; model: string }> {
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  const savedAi = userSettings
    ? (JSON.parse(userSettings.settings).ai as
        | { provider?: AiProvider; model?: string }
        | undefined)
    : undefined;

  const provider = savedAi?.provider ?? AiProvider.GEMINI;
  const defaultModelForProvider =
    provider === AiProvider.OLLAMA ? DEFAULT_OLLAMA_MODEL : DEFAULT_GEMINI_MODEL;

  return { provider, model: savedAi?.model || defaultModelForProvider };
}

/**
 * True for a Gemini rate-limit/quota error — both the direct AI SDK
 * APICallError shape (statusCode on the error itself) and the RetryError
 * shape generateText/generateVerifiedContent throw after exhausting retries
 * (statusCode nested under lastError), plus a text fallback since error
 * shapes vary across AI SDK versions/providers.
 */
export function isGeminiQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const anyErr = error as any;
  const statusCode = anyErr?.statusCode ?? anyErr?.lastError?.statusCode;
  if (statusCode === 429) return true;
  return /quota/i.test(error.message) || /RESOURCE_EXHAUSTED/i.test(error.message);
}

export interface AiFallbackResult<T> {
  result: T;
  /** The provider that actually produced the result (may differ from the
   * resolved default if a Gemini quota error triggered the Ollama fallback). */
  providerUsed: AiProvider;
  usedOfflineFallback: boolean;
}

/**
 * Resolves the user's default/explicit AI provider (resolveDefaultAi) and
 * runs `run` against it. Only when the resolved provider was Gemini — never
 * when the user explicitly chose something else in AI Settings — and the
 * call failed with a quota error, retries once against Ollama instead of
 * failing the whole step outright. `run` receives the provider actually in
 * use for that attempt (not just the model) so callers can re-truncate
 * prompt text with the right per-provider budget on each attempt. Callers
 * surface `usedOfflineFallback` so the UI can show a small, non-blocking note.
 */
export async function callWithGeminiFallback<T>(
  userId: string,
  run: (model: Awaited<ReturnType<typeof getModel>>, provider: AiProvider) => Promise<T>,
): Promise<AiFallbackResult<T>> {
  const ai = await resolveDefaultAi(userId);
  const model = await getModel(ai.provider, ai.model, userId);

  try {
    const result = await run(model, ai.provider);
    return { result, providerUsed: ai.provider, usedOfflineFallback: false };
  } catch (error) {
    if (ai.provider !== AiProvider.GEMINI || !isGeminiQuotaError(error)) {
      throw error;
    }
    const fallbackModel = await getModel(AiProvider.OLLAMA, DEFAULT_OLLAMA_MODEL, userId);
    const result = await run(fallbackModel, AiProvider.OLLAMA);
    return { result, providerUsed: AiProvider.OLLAMA, usedOfflineFallback: true };
  }
}
