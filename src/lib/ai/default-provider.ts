import "server-only";

import prisma from "@/lib/db";
import { AiProvider } from "@/models/ai.model";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL } from "@/lib/ai/config";

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
