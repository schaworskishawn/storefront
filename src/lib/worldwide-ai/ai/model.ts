import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { WorldwideAiConfig } from "../config";

/**
 * The one model provider Phase 1 uses: Anthropic, through the Vercel AI SDK. The model id and key come from the
 * environment, so changing the model (or, later, the provider) is a configuration change in this file only.
 */

export type ModelHandle = { model: LanguageModel; modelId: string; provider: string };

/** The configured model, or null when no key is set. A missing key is reported as such; nothing falls back to a made-up answer. */
export function resolveModel(
	config: WorldwideAiConfig,
	env: Record<string, string | undefined> = process.env,
): ModelHandle | null {
	const apiKey = env.ANTHROPIC_API_KEY?.trim();
	if (!apiKey || !config.model.apiKeySet) return null;
	const anthropic = createAnthropic({ apiKey });
	return {
		model: anthropic(config.model.modelId),
		modelId: config.model.modelId,
		provider: config.model.provider,
	};
}
