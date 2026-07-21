import { z } from "zod";

export const AI_PROVIDERS = [
  { value: "openai", label: "OpenAI (ChatGPT)" },
  { value: "google", label: "Google (Gemini)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openrouter", label: "OpenRouter" },
] as const;

/** Suggested default model per provider (user can override the text). */
export const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  google: "gemini-1.5-flash",
  anthropic: "claude-3-5-haiku-latest",
  openrouter: "openai/gpt-4o-mini",
};

/** Prompt base pré-pronto (Markdown) — o usuário edita só o texto das instruções. */
export const DEFAULT_INSTRUCTIONS = `## Papel

Você é um atendente virtual simpático e objetivo.

## Regras

- Responda sempre em **português do Brasil**, de forma natural e cordial.
- Seja breve: mensagens curtas, como em uma conversa real de WhatsApp.
- Só afirme o que tem certeza; **nunca invente** informações, preços ou prazos.
- Se não souber ou não puder ajudar, ofereça encaminhar para um atendente humano.

## Sobre o negócio

Descreva aqui o negócio, o tom de voz e o que o agente deve fazer.`;

const providerEnum = z.enum(["openai", "google", "anthropic", "openrouter"]);
const evolutionModeEnum = z.enum(["existing", "create"]);

export const agentFormSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome").max(80),
    instructions: z.string().max(8000).default(""),
    debounceSeconds: z.coerce
      .number()
      .int()
      .min(5, "Mínimo 5s")
      .max(600, "Máximo 600s")
      .default(30),
    aiProvider: providerEnum,
    aiModel: z.string().trim().min(1, "Informe o modelo"),
    // On create this is required; on update, empty means "keep current key".
    aiApiKey: z.string().trim().default(""),
    evolutionMode: evolutionModeEnum.default("existing"),
    evolutionUrl: z
      .string()
      .trim()
      .url("URL inválida")
      .or(z.literal(""))
      .default(""),
    evolutionApiKey: z.string().trim().default(""),
    // Always required: it is either an existing instance or the name we create.
    evolutionInstanceName: z
      .string()
      .trim()
      .min(1, "Informe o nome da instância"),
  });

export type AgentFormValues = z.input<typeof agentFormSchema>;
export type AgentFormParsed = z.output<typeof agentFormSchema>;
