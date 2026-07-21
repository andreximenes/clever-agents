import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { contacts, conversations, messages } from "../db/schema.ts";

export type ConversationSummary = {
  id: string;
  contactName: string | null;
  contactPhone: string;
  channel: "whatsapp" | "test";
  lastMessageAt: Date;
  lastMessage: string | null;
  lastDirection: "in" | "out" | null;
  lastType: "text" | "audio" | "image" | null;
  messageCount: number;
};

/** Conversations of an agent, most recently active first, with a preview. */
export async function listConversations(
  db: Database,
  agentId: string,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      lastMessageAt: conversations.lastMessageAt,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(conversations.agentId, agentId))
    .orderBy(desc(conversations.lastMessageAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // One row per conversation: its most recent message.
  const previews = await db
    .select({
      conversationId: messages.conversationId,
      content: messages.content,
      direction: messages.direction,
      type: messages.type,
      createdAt: messages.createdAt,
      rank: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`.as(
        "rank",
      ),
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids));

  const counts = await db
    .select({
      conversationId: messages.conversationId,
      total: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .groupBy(messages.conversationId);

  const lastByConversation = new Map(
    previews.filter((p) => Number(p.rank) === 1).map((p) => [p.conversationId, p]),
  );
  const countByConversation = new Map(
    counts.map((c) => [c.conversationId, Number(c.total)]),
  );

  return rows.map((r) => {
    const last = lastByConversation.get(r.id);
    return {
      id: r.id,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      channel: r.channel,
      lastMessageAt: r.lastMessageAt,
      lastMessage: last?.content ?? null,
      lastDirection: last?.direction ?? null,
      lastType: last?.type ?? null,
      messageCount: countByConversation.get(r.id) ?? 0,
    };
  });
}

/** Full message timeline of a conversation, oldest first. */
export async function getConversationDetail(
  db: Database,
  agentId: string,
  conversationId: string,
) {
  const [conversation] = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      contactSummary: contacts.summary,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.agentId, agentId),
      ),
    )
    .limit(1);
  if (!conversation) return null;

  const timeline = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  return { conversation, messages: timeline };
}
