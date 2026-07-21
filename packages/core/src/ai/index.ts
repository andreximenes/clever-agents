import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embedMany, generateText, type LanguageModel } from "ai";

export type AiProvider = "openai" | "google" | "anthropic" | "openrouter";

export type AgentAiConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

/** Builds the chat model for an agent's configured provider + key. */
export function chatModel(cfg: AgentAiConfig): LanguageModel {
  switch (cfg.provider) {
    case "openai":
      return createOpenAI({ apiKey: cfg.apiKey })(cfg.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(cfg.model);
    case "anthropic":
      return createAnthropic({ apiKey: cfg.apiKey })(cfg.model);
    case "openrouter":
      return createOpenRouter({ apiKey: cfg.apiKey })(cfg.model);
  }
}

/** Generates a plain-text completion from a system + user prompt. */
export async function generateReply(
  cfg: AgentAiConfig,
  input: { system: string; prompt: string },
): Promise<string> {
  const { text } = await generateText({
    model: chatModel(cfg),
    system: input.system,
    prompt: input.prompt,
  });
  return text;
}

/** Generates a reply from a system prompt plus a chat message history. */
export async function generateChat(
  cfg: AgentAiConfig,
  input: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<string> {
  const { text } = await generateText({
    model: chatModel(cfg),
    system: input.system,
    messages: input.messages,
  });
  return text;
}

/** Produces a short summary of a document (used as always-on knowledge context). */
export async function summarizeDocument(
  cfg: AgentAiConfig,
  text: string,
): Promise<string> {
  const clipped = text.slice(0, 12_000);
  return generateReply(cfg, {
    system:
      "Você resume documentos para servir de contexto a um atendente de WhatsApp. " +
      "Escreva um resumo objetivo em português do Brasil, em no máximo 8 linhas, " +
      "destacando fatos, produtos, preços, políticas e informações úteis para atendimento.",
    prompt: `Resuma o documento a seguir:\n\n${clipped}`,
  });
}

// ---------------------------------------------------------------------------
// Embeddings — platform-level, single model (see EMBEDDING_DIMENSIONS).
// Optional: when EMBEDDINGS_API_KEY is absent, agents run in summary-only mode.
// ---------------------------------------------------------------------------

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.EMBEDDINGS_API_KEY);
}

/** Embeds texts with the platform embeddings model (OpenAI-compatible). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.EMBEDDINGS_API_KEY;
  if (!apiKey) throw new Error("EMBEDDINGS_API_KEY is not set");
  const model = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";
  const baseURL = process.env.EMBEDDINGS_BASE_URL || undefined;
  const provider = createOpenAI({ apiKey, baseURL });
  const { embeddings } = await embedMany({
    model: provider.textEmbeddingModel(model),
    values: texts,
  });
  return embeddings;
}

/** Embeds a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  if (!embedding) throw new Error("Failed to embed query");
  return embedding;
}
