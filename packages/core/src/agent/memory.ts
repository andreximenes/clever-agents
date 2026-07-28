import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { contacts, messages } from "../db/schema.ts";
import { generateReply, type AgentAiConfig } from "../ai/index.ts";
import { renderMessageContent } from "./prompt.ts";

const MEMORY_WINDOW = 24;

/**
 * Refreshes the contact's rolling memory summary from the recent conversation,
 * so future conversations can recall past context without replaying everything.
 */
export async function updateContactSummary(
  db: Database,
  aiCfg: AgentAiConfig,
  contactId: string,
  conversationId: string,
): Promise<string> {
  const recent = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(MEMORY_WINDOW);
  recent.reverse();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  // Same rendering the reply model sees: audio messages have empty `content`,
  // their words live in `transcription` — without this the summary never
  // records anything the contact said by voice.
  const transcript = recent
    .map((m) => {
      const content = renderMessageContent(m);
      if (!content) return null;
      return `${m.direction === "in" ? "Cliente" : "Agente"}: ${content}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  const summary = await generateReply(aiCfg, {
    system:
      "Você mantém uma memória curta de um cliente para um atendente de WhatsApp. " +
      "Atualize o resumo com base no resumo anterior e na conversa recente. " +
      "Escreva no máximo 6 linhas, em português do Brasil, com fatos úteis: nome, " +
      "preferências, pedidos, pendências e combinados. Não invente nada. " +
      "Áudios chegam transcritos e são entendidos normalmente: nunca registre " +
      "que o agente não ouve áudios ou que o cliente deve preferir texto. " +
      "Se o resumo anterior disser algo assim, remova.",
    prompt:
      `Resumo anterior:\n${contact?.summary || "(vazio)"}\n\n` +
      `Conversa recente:\n${transcript}\n\n` +
      `Novo resumo atualizado:`,
  });

  await db
    .update(contacts)
    .set({ summary: summary.trim(), summaryUpdatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  return summary.trim();
}

/** Loads the last N messages of a conversation in chronological order. */
export async function loadRecentMessages(
  db: Database,
  conversationId: string,
  limit = 14,
) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

// Re-exported for callers that want strictly ascending helpers.
export { asc };
