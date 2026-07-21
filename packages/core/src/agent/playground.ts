import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import {
  contacts,
  conversations,
  messages,
  type Message,
} from "../db/schema.ts";
import { runConversationReply } from "./reply.ts";

const PLAYGROUND_PHONE = "playground";

/** Finds or creates the agent's single test contact + conversation. */
async function ensurePlaygroundConversation(
  db: Database,
  agentId: string,
): Promise<string> {
  const [contact] = await db
    .insert(contacts)
    .values({ agentId, phone: PLAYGROUND_PHONE, name: "Playground" })
    .onConflictDoNothing({ target: [contacts.agentId, contacts.phone] })
    .returning();

  const contactId =
    contact?.id ??
    (
      await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.agentId, agentId),
            eq(contacts.phone, PLAYGROUND_PHONE),
          ),
        )
        .limit(1)
    )[0]?.id;
  if (!contactId) throw new Error("failed to ensure playground contact");

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.agentId, agentId),
        eq(conversations.contactId, contactId),
        eq(conversations.channel, "test"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ agentId, contactId, channel: "test" })
    .returning({ id: conversations.id });
  if (!created) throw new Error("failed to create playground conversation");
  return created.id;
}

/** Sends a user message to the agent's playground and returns its reply. */
export async function sendPlaygroundMessage(
  db: Database,
  agentId: string,
  text: string,
) {
  const conversationId = await ensurePlaygroundConversation(db, agentId);
  await db.insert(messages).values({
    conversationId,
    direction: "in",
    type: "text",
    content: text,
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const result = await runConversationReply(db, conversationId, { send: false });
  return result;
}

/** Returns the playground conversation history in chronological order. */
export async function getPlaygroundHistory(
  db: Database,
  agentId: string,
): Promise<Message[]> {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.agentId, agentId), eq(contacts.phone, PLAYGROUND_PHONE)),
    )
    .limit(1);
  if (!contact) return [];

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.agentId, agentId),
        eq(conversations.contactId, contact.id),
        eq(conversations.channel, "test"),
      ),
    )
    .limit(1);
  if (!conv) return [];

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));
}

/** Clears the playground conversation (fresh test). */
export async function resetPlayground(
  db: Database,
  agentId: string,
): Promise<void> {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.agentId, agentId), eq(contacts.phone, PLAYGROUND_PHONE)),
    )
    .limit(1);
  if (!contact) return;
  await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.agentId, agentId),
        eq(conversations.contactId, contact.id),
        eq(conversations.channel, "test"),
      ),
    );
}
