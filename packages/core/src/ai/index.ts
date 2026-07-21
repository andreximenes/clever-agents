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

// ---------------------------------------------------------------------------
// Speech-to-text for received WhatsApp audio. Uses an OpenAI-compatible
// transcription endpoint; falls back to the embeddings key when it is the same
// provider. Without a key, agents simply ask the contact to write instead.
// ---------------------------------------------------------------------------

function transcriptionKey(): string | undefined {
  return process.env.TRANSCRIPTION_API_KEY || process.env.EMBEDDINGS_API_KEY;
}

/**
 * Enabled by an API key (hosted provider) or just a base URL (self-hosted
 * service, which needs no credentials).
 */
export function transcriptionAvailable(): boolean {
  return Boolean(transcriptionKey() || process.env.TRANSCRIPTION_BASE_URL);
}

/** Transcribes base64-encoded audio to text. Throws when not configured. */
export async function transcribeAudio(
  base64: string,
  mimetype = "audio/ogg",
): Promise<string> {
  const apiKey = transcriptionKey();
  const explicitBase = process.env.TRANSCRIPTION_BASE_URL;
  if (!apiKey && !explicitBase) {
    throw new Error("Transcription is not configured");
  }
  const baseURL = (
    explicitBase ||
    process.env.EMBEDDINGS_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.TRANSCRIPTION_MODEL ?? "whisper-1";

  const bytes = Buffer.from(base64, "base64");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimetype }), "audio.ogg");
  form.append("model", model);
  form.append("language", "pt");

  const res = await fetch(`${baseURL}/audio/transcriptions`, {
    method: "POST",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Transcrição falhou (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Embeds a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  if (!embedding) throw new Error("Failed to embed query");
  return embedding;
}
