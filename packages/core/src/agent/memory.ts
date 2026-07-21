import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { contacts, messages } from "../db/schema.ts";
import { generateReply, type AgentAiConfig } from "../ai/index.ts";

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

  const transcript = recent
    .map((m) => `${m.direction === "in" ? "Cliente" : "Agente"}: ${m.content}`)
    .join("\n");

  const summary = await generateReply(aiCfg, {
    system:
      "Você mantém uma memória curta de um cliente para um atendente de WhatsApp. " +
      "Atualize o resumo com base no resumo anterior e na conversa recente. " +
      "Escreva no máximo 6 linhas, em português do Brasil, com fatos úteis: nome, " +
      "preferências, pedidos, pendências e combinados. Não invente nada.",
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
