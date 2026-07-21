import "server-only";

export type AiProvider = "openai" | "google" | "anthropic" | "openrouter";

/** What the browser may know: never the keys themselves. */
export type PlatformDefaults = {
  ai: { available: boolean; provider: AiProvider; model: string };
  evolution: { available: boolean; url: string };
};

const PROVIDERS: AiProvider[] = ["openai", "google", "anthropic", "openrouter"];

function provider(): AiProvider {
  const value = process.env.PLATFORM_AI_PROVIDER as AiProvider | undefined;
  return value && PROVIDERS.includes(value) ? value : "openrouter";
}

/**
 * Shared credentials the platform offers so a new agent works out of the box.
 * Only non-secret fields are exposed to the client.
 */
export function platformDefaults(): PlatformDefaults {
  return {
    ai: {
      available: Boolean(process.env.PLATFORM_AI_API_KEY),
      provider: provider(),
      model: process.env.PLATFORM_AI_MODEL ?? "openai/gpt-4o-mini",
    },
    evolution: {
      available: Boolean(
        process.env.PLATFORM_EVOLUTION_URL &&
          process.env.PLATFORM_EVOLUTION_API_KEY,
      ),
      url: process.env.PLATFORM_EVOLUTION_URL ?? "",
    },
  };
}

/** Server-only: the actual AI credentials, or null when not configured. */
export function platformAiSecret() {
  const apiKey = process.env.PLATFORM_AI_API_KEY;
  if (!apiKey) return null;
  return {
    provider: provider(),
    model: process.env.PLATFORM_AI_MODEL ?? "openai/gpt-4o-mini",
    apiKey,
  };
}

/** Server-only: the actual Evolution credentials, or null when not configured. */
export function platformEvolutionSecret() {
  const url = process.env.PLATFORM_EVOLUTION_URL;
  const apiKey = process.env.PLATFORM_EVOLUTION_API_KEY;
  if (!url || !apiKey) return null;
  return { url, apiKey };
}
