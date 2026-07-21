import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/** Embedding dimension — fixed platform-wide (OpenAI text-embedding-3-small). */
export const EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["admin", "user"]);
export const themeEnum = pgEnum("theme", ["light", "dark"]);
export const aiProviderEnum = pgEnum("ai_provider", [
  "openai",
  "google",
  "anthropic",
  "openrouter",
]);
export const evolutionModeEnum = pgEnum("evolution_mode", [
  "existing", // user brings a running instance; platform only sets the webhook
  "create", // platform creates the instance and shows the QR
]);
export const agentStatusEnum = pgEnum("agent_status", [
  "draft",
  "connecting",
  "connected",
  "disconnected",
  "error",
]);
export const documentStatusEnum = pgEnum("document_status", [
  "processing",
  "ready",
  "error",
]);
export const channelEnum = pgEnum("channel", ["whatsapp", "test"]);
export const directionEnum = pgEnum("direction", ["in", "out"]);
export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "audio",
  "image",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** One row per auth.users. Created automatically by a trigger on signup. */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull().default("user"),
  name: text("name"),
  /** UI preference, so the theme follows the user across devices. */
  theme: themeEnum("theme").notNull().default("dark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull().default(""),
    debounceSeconds: integer("debounce_seconds").notNull().default(30),

    // AI provider config (key stored encrypted at rest).
    aiProvider: aiProviderEnum("ai_provider").notNull(),
    aiApiKeyEncrypted: text("ai_api_key_encrypted").notNull(),
    aiModel: text("ai_model").notNull(),

    // Evolution / WhatsApp config (key stored encrypted at rest).
    evolutionMode: evolutionModeEnum("evolution_mode")
      .notNull()
      .default("existing"),
    evolutionUrl: text("evolution_url"),
    evolutionApiKeyEncrypted: text("evolution_api_key_encrypted"),
    evolutionInstanceName: text("evolution_instance_name"),

    // Per-agent secret appended to the webhook URL to authenticate Evolution.
    webhookToken: text("webhook_token").notNull(),
    status: agentStatusEnum("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agents_owner_id_idx").on(t.ownerId)],
).enableRLS();

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    /** Full WhatsApp JID (…@s.whatsapp.net or …@lid). Replies go to this. */
    jid: text("jid"),
    name: text("name"),
    // Rolling memory summary for this contact across conversations.
    summary: text("summary").notNull().default(""),
    summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("contacts_agent_phone_uq").on(t.agentId, t.phone)],
).enableRLS();

/**
 * Grants a user access to a single agent. Members can view and edit the agent
 * (instructions, knowledge base, WhatsApp connection, playground) but cannot
 * delete it or invite other people — that stays with the owner and admins.
 */
export const agentMembers = pgTable(
  "agent_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("agent_members_agent_user_uq").on(t.agentId, t.userId),
    index("agent_members_user_id_idx").on(t.userId),
  ],
).enableRLS();

/** A file the user uploaded as knowledge base for an agent. */
export const agentDocuments = pgTable(
  "agent_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    status: documentStatusEnum("status").notNull().default("processing"),
    // Short summary always injected into the prompt at conversation start.
    summary: text("summary").notNull().default(""),
    charCount: integer("char_count").notNull().default(0),
    chunkCount: integer("chunk_count").notNull().default(0),
    // True when chunks were embedded (semantic search available for this doc).
    embedded: boolean("embedded").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agent_documents_agent_id_idx").on(t.agentId)],
).enableRLS();

/** A chunk of a document's extracted text, optionally with its embedding. */
export const agentDocumentChunks = pgTable(
  "agent_document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => agentDocuments.id, { onDelete: "cascade" }),
    // Denormalized for efficient per-agent similarity search.
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    // Null when the platform has no embeddings key (summary-only mode).
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agent_document_chunks_agent_id_idx").on(t.agentId)],
).enableRLS();

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull().default("whatsapp"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("conversations_agent_id_idx").on(t.agentId),
    index("conversations_contact_id_idx").on(t.contactId),
  ],
).enableRLS();

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: directionEnum("direction").notNull(),
    type: messageTypeEnum("type").notNull().default("text"),
    content: text("content").notNull().default(""),
    transcription: text("transcription"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("messages_conversation_id_idx").on(t.conversationId),
    index("messages_created_at_idx").on(t.createdAt),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Relations (query-time type-safety)
// ---------------------------------------------------------------------------

export const profilesRelations = relations(profiles, ({ many }) => ({
  agents: many(agents),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [agents.ownerId],
    references: [profiles.id],
  }),
  contacts: many(contacts),
  conversations: many(conversations),
  documents: many(agentDocuments),
  members: many(agentMembers),
}));

export const agentMembersRelations = relations(agentMembers, ({ one }) => ({
  agent: one(agents, {
    fields: [agentMembers.agentId],
    references: [agents.id],
  }),
  user: one(profiles, {
    fields: [agentMembers.userId],
    references: [profiles.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  agent: one(agents, {
    fields: [contacts.agentId],
    references: [agents.id],
  }),
  conversations: many(conversations),
}));

export const agentDocumentsRelations = relations(
  agentDocuments,
  ({ one, many }) => ({
    agent: one(agents, {
      fields: [agentDocuments.agentId],
      references: [agents.id],
    }),
    chunks: many(agentDocumentChunks),
  }),
);

export const agentDocumentChunksRelations = relations(
  agentDocumentChunks,
  ({ one }) => ({
    document: one(agentDocuments, {
      fields: [agentDocumentChunks.documentId],
      references: [agentDocuments.id],
    }),
  }),
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    agent: one(agents, {
      fields: [conversations.agentId],
      references: [agents.id],
    }),
    contact: one(contacts, {
      fields: [conversations.contactId],
      references: [contacts.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// Convenience: marker used by policies.sql so grep can find the RLS companion.
export const RLS_COMPANION = sql`-- see src/db/policies.sql`;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Profile = typeof profiles.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type AgentMember = typeof agentMembers.$inferSelect;
export type AgentDocument = typeof agentDocuments.$inferSelect;
export type NewAgentDocument = typeof agentDocuments.$inferInsert;
export type AgentDocumentChunk = typeof agentDocumentChunks.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
