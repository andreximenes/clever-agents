/** A normalized inbound WhatsApp message extracted from an Evolution Go webhook. */
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
  /** Raw WhatsApp message object (Evolution Go needs it to download audio). */
  rawMessage?: unknown;
};

/**
 * Extracts a single inbound individual-chat message from an Evolution Go webhook
 * body, or null when the event isn't an inbound message we handle (group
 * messages, our own outbound echoes, status broadcasts, etc.).
 */
export function parseInboundMessage(body: unknown): InboundMessage | null {
  return parseGoMessage(body);
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Evolution Go webhook: `{ event: "Message", instanceId, data: { Info, Message } }`
 * (whatsmeow's `events.Message` as JSON; format checked against a real event).
 */
function parseGoMessage(body: unknown): InboundMessage | null {
  const root = obj(body);
  if (str(root.event).toLowerCase() !== "message") return null;
  const payload = obj(root.data);
  const info = obj(payload.Info);
  if (!info.Chat || info.IsFromMe || info.IsGroup || payload.IsEdit) return null;

  // WhatsApp sometimes identifies the chat by an opaque @lid; the real number
  // travels in SenderAlt, and replies must go to the number.
  let jid = str(info.Chat);
  if (jid.endsWith("@lid")) {
    const alt = str(info.SenderAlt);
    if (alt.endsWith("@s.whatsapp.net")) jid = alt;
  }
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return null;
  const phone = jid.split("@")[0] ?? "";
  const id = str(info.ID);
  if (!phone || !id) return null;

  const message = obj(payload.Message);
  // Reactions, protocol/poll updates are not conversation turns.
  if (message.reactionMessage || message.protocolMessage || message.pollUpdateMessage) {
    return null;
  }
  const { type, text } = extractContent(message);
  const ts = Date.parse(str(info.Timestamp));

  return {
    phone,
    jid,
    pushName: str(info.PushName) || null,
    type,
    text,
    providerMessageId: id,
    timestamp: Number.isNaN(ts) ? null : Math.floor(ts / 1000),
    rawMessage: type === "audio" ? message : undefined,
  };
}

function extractContent(
  message: Record<string, unknown>,
): { type: InboundMessage["type"]; text: string } {
  const conversation = message.conversation;
  if (typeof conversation === "string") return { type: "text", text: conversation };

  const extended = message.extendedTextMessage;
  if (extended && typeof extended === "object" && "text" in extended) {
    const t = (extended as { text?: unknown }).text;
    if (typeof t === "string") return { type: "text", text: t };
  }

  if (message.audioMessage) {
    return { type: "audio", text: "" };
  }
  if (message.imageMessage) {
    const caption = (message.imageMessage as { caption?: unknown })?.caption;
    return { type: "image", text: typeof caption === "string" ? caption : "" };
  }

  return { type: "text", text: "" };
}
