// Re-export types from schemas
export type {
  JobMatchRecommendation,
  JobMatchScores,
  JobMatchResult,
  JobMatchData,
} from "./ai.schemas";

import { DEFAULT_OLLAMA_MODEL } from "@/lib/ai/config";

// AI MODEL

export interface AiModel {
  provider: AiProvider;
  model: string | undefined;
}

// Provider enum - extensible for future providers
export enum AiProvider {
  OLLAMA = "ollama",
  OPENAI = "openai",
  DEEPSEEK = "deepseek",
  GEMINI = "gemini",
  OPENROUTER = "openrouter",
}

// Default models per provider
export enum OllamaModel {
  LLAMA3_1 = "llama3.1",
  LLAMA3_2 = "llama3.2",
}

export enum OpenaiModel {
  GPT3_5 = "gpt-3.5-turbo",
  GPT4O = "gpt-4o",
  GPT4O_MINI = "gpt-4o-mini",
}

export enum DeepseekModel {
  DEEPSEEK_CHAT = "deepseek-chat",
  DEEPSEEK_REASONER = "deepseek-reasoner",
}

export enum GeminiModel {
  GEMINI_2_0_FLASH = "gemini-2.0-flash",
  GEMINI_2_0_FLASH_LITE = "gemini-2.0-flash-lite",
  GEMINI_1_5_PRO = "gemini-1.5-pro",
  GEMINI_1_5_FLASH = "gemini-1.5-flash",
}

export const defaultModel: AiModel = {
  provider: AiProvider.OLLAMA,
  // Fallback only — used as the initial React state for job-match, resume-
  // review, and create-resume before the user's saved AI Settings (if any)
  // load, and never overwritten if they haven't saved a preference yet.
  // The model picker on the AI Settings page (src/components/settings/
  // AiSettings.tsx) remains the user's override mechanism, untouched here.
  model: DEFAULT_OLLAMA_MODEL,
};
