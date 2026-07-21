import { z } from "zod";

/** A normalized inbound WhatsApp message extracted from an Evolution webhook. */
export type InboundMessage = {
  /** Local part of the JID: a phone number, or a LID when WhatsApp hides it. */
  phone: string;
  /** Full JID as WhatsApp sent it — replies must be addressed to this. */
  jid: string;
  pushName: string | null;
  type: "text" | "audio" | "image";
  text: string;
  providerMessageId: string | null;
  timestamp: number | null;
};

const webhookSchema = z
  .object({
    event: z.string(),
    instance: z.string().optional(),
    data: z
      .object({
        key: z
          .object({
            remoteJid: z.string(),
            fromMe: z.boolean().optional(),
            id: z.string().optional(),
          })
          .passthrough(),
        pushName: z.string().nullish(),
        messageType: z.string().optional(),
        messageTimestamp: z.union([z.number(), z.string()]).nullish(),
        message: z.record(z.string(), z.unknown()).nullish(),
      })
      .passthrough(),
  })
  .passthrough();

function isMessagesUpsert(event: string): boolean {
  const e = event.toLowerCase().replace(/_/g, ".");
  return e === "messages.upsert";
}

/**
 * Extracts a single inbound individual-chat message from an Evolution webhook
 * body, or null when the event isn't an inbound message we handle (group
 * messages, our own outbound echoes, status broadcasts, etc.).
 */
export function parseInboundMessage(body: unknown): InboundMessage | null {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return null;
  const { event, data } = parsed.data;

  if (!isMessagesUpsert(event)) return null;
  if (data.key.fromMe) return null;

  const jid = data.key.remoteJid;
  // Individual chats only. WhatsApp uses @s.whatsapp.net and, increasingly,
  // @lid (privacy-preserving ids). Skip groups (@g.us) and status broadcasts.
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return null;
  const phone = jid.split("@")[0] ?? "";
  if (!phone) return null;

  const message = data.message ?? {};
  const { type, text } = extractContent(message, data.messageType);

  return {
    phone,
    jid,
    pushName: data.pushName ?? null,
    type,
    text,
    providerMessageId: data.key.id ?? null,
    timestamp: normalizeTimestamp(data.messageTimestamp),
  };
}

function extractContent(
  message: Record<string, unknown>,
  messageType?: string,
): { type: InboundMessage["type"]; text: string } {
  const conversation = message.conversation;
  if (typeof conversation === "string") return { type: "text", text: conversation };

  const extended = message.extendedTextMessage;
  if (extended && typeof extended === "object" && "text" in extended) {
    const t = (extended as { text?: unknown }).text;
    if (typeof t === "string") return { type: "text", text: t };
  }

  if (message.audioMessage || messageType === "audioMessage") {
    return { type: "audio", text: "" };
  }
  if (message.imageMessage || messageType === "imageMessage") {
    const caption = (message.imageMessage as { caption?: unknown })?.caption;
    return { type: "image", text: typeof caption === "string" ? caption : "" };
  }

  return { type: "text", text: "" };
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
