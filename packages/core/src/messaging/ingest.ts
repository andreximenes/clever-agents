import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import {
  contacts,
  conversations,
  messages,
  type Message,
} from "../db/schema.ts";
import type { InboundMessage } from "../evolution/webhook.ts";

export type IngestResult = {
  contactId: string;
  conversationId: string;
  messageId: string;
  lastMessageAt: Date;
};

/**
 * Persists an inbound WhatsApp message: upserts the contact, finds or creates
 * the contact's ongoing conversation, and appends the message. One continuous
 * conversation per (agent, contact) on the WhatsApp channel.
 */
export async function ingestInboundMessage(
  db: Database,
  agentId: string,
  msg: InboundMessage,
): Promise<IngestResult> {
  const [contact] = await db
    .insert(contacts)
    .values({ agentId, phone: msg.phone, jid: msg.jid, name: msg.pushName })
    .onConflictDoUpdate({
      target: [contacts.agentId, contacts.phone],
      set: {
        name: sql`coalesce(excluded.name, ${contacts.name})`,
        jid: sql`coalesce(excluded.jid, ${contacts.jid})`,
      },
    })
    .returning();
  if (!contact) throw new Error("Failed to upsert contact");

  const conversationId = await findOrCreateConversation(
    db,
    agentId,
    contact.id,
  );

  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      direction: "in",
      type: msg.type,
      content: msg.text,
      providerMessageId: msg.providerMessageId,
    })
    .returning({ id: messages.id });
  if (!message) throw new Error("Failed to insert message");

  const lastMessageAt = new Date();
  await db
    .update(conversations)
    .set({ lastMessageAt })
    .where(eq(conversations.id, conversationId));

  return {
    contactId: contact.id,
    conversationId,
    messageId: message.id,
    lastMessageAt,
  };
}

/** Records an outbound message the agent sent back to a contact. */
export async function recordOutboundMessage(
  db: Database,
  conversationId: string,
  text: string,
  providerMessageId?: string,
): Promise<Message> {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      direction: "out",
      type: "text",
      content: text,
      providerMessageId: providerMessageId ?? null,
    })
    .returning();
  if (!message) throw new Error("Failed to record outbound message");
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));
  return message;
}

async function findOrCreateConversation(
  db: Database,
  agentId: string,
  contactId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.agentId, agentId),
        eq(conversations.contactId, contactId),
        eq(conversations.channel, "whatsapp"),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ agentId, contactId, channel: "whatsapp" })
    .returning({ id: conversations.id });
  if (!created) throw new Error("Failed to create conversation");
  return created.id;
}
