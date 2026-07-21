import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { agents, contacts, conversations } from "../db/schema.ts";
import { decryptSecret } from "../crypto.ts";
import { generateChat, type AgentAiConfig } from "../ai/index.ts";
import { buildKnowledgeContext } from "../documents/retrieve.ts";
import { createEvolutionClient } from "../evolution/client.ts";
import { recordOutboundMessage } from "../messaging/ingest.ts";
import { buildModelMessages, buildSystemPrompt } from "./prompt.ts";
import { loadRecentMessages, updateContactSummary } from "./memory.ts";

export type ReplyResult =
  | { ok: true; text: string; sent: boolean }
  | { ok: false; reason: "no_messages" | "empty_reply" | "error"; error?: string };

/**
 * Runs the full reply pipeline for a conversation: builds the prompt from
 * instructions + contact memory + knowledge base, calls the agent's model,
 * records the reply, optionally sends it over WhatsApp, and refreshes memory.
 */
export async function runConversationReply(
  db: Database,
  conversationId: string,
  options: { send: boolean },
): Promise<ReplyResult> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) return { ok: false, reason: "error", error: "conversa não encontrada" };

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, conversation.agentId))
    .limit(1);
  if (!agent) return { ok: false, reason: "error", error: "agente não encontrado" };

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, conversation.contactId))
    .limit(1);
  if (!contact) return { ok: false, reason: "error", error: "contato não encontrado" };

  const recent = await loadRecentMessages(db, conversationId);
  const modelMessages = buildModelMessages(recent);
  if (modelMessages.length === 0 || modelMessages.at(-1)?.role !== "user") {
    return { ok: false, reason: "no_messages" };
  }

  const aiCfg: AgentAiConfig = {
    provider: agent.aiProvider,
    apiKey: decryptSecret(agent.aiApiKeyEncrypted),
    model: agent.aiModel,
  };

  const lastUserText =
    [...modelMessages].reverse().find((m) => m.role === "user")?.content ?? "";
  const knowledge = await buildKnowledgeContext(db, agent.id, lastUserText);

  const system = buildSystemPrompt({
    instructions: agent.instructions,
    contactSummary: contact.summary,
    knowledge,
  });

  let text: string;
  try {
    text = (await generateChat(aiCfg, { system, messages: modelMessages })).trim();
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : "falha ao gerar resposta",
    };
  }
  if (!text) return { ok: false, reason: "empty_reply" };

  let sent = false;
  let providerMessageId: string | undefined;

  if (
    options.send &&
    conversation.channel === "whatsapp" &&
    agent.evolutionUrl &&
    agent.evolutionApiKeyEncrypted &&
    agent.evolutionInstanceName
  ) {
    const client = createEvolutionClient({
      baseUrl: agent.evolutionUrl,
      apiKey: decryptSecret(agent.evolutionApiKeyEncrypted),
    });
    // Address the reply to the exact JID WhatsApp used (handles @lid contacts).
    const target = contact.jid ?? contact.phone;
    try {
      const res = (await client.sendText(
        agent.evolutionInstanceName,
        target,
        text,
      )) as { key?: { id?: string } } | null;
      providerMessageId = res?.key?.id;
      sent = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "erro";
      // Keep the generated reply out of history when it never reached anyone,
      // and surface a message that names the actual problem.
      return {
        ok: false,
        reason: "error",
        error: target.endsWith("@lid")
          ? `Não foi possível responder a ${target}: este servidor Evolution não envia para identificadores @lid (atualize a Evolution API). Detalhe: ${detail}`
          : `Falha ao enviar para ${target}: ${detail}`,
      };
    }
  }

  await recordOutboundMessage(db, conversationId, text, providerMessageId);

  // Refresh the contact's memory in the background of the request path.
  try {
    await updateContactSummary(db, aiCfg, contact.id, conversationId);
  } catch {
    // Non-fatal: a failed summary update must not break the reply.
  }

  return { ok: true, text, sent };
}
