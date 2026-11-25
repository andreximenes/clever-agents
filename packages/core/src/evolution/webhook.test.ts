import { describe, expect, it } from "vitest";
import { parseInboundMessage } from "./webhook.ts";

/** Evolution Go webhook: whatsmeow `events.Message` wrapped in `{ event, data }`. */
const event = (
  message: Record<string, unknown>,
  info: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) => ({
  event: "Message",
  instanceId: "inst-1",
  data: {
    Info: {
      Chat: "5511999999999@s.whatsapp.net",
      Sender: "5511999999999@s.whatsapp.net",
      IsFromMe: false,
      IsGroup: false,
      ID: "3EB0ABC",
      PushName: "Fulano",
      Timestamp: "2026-11-25T20:00:00-03:00",
      ...info,
    },
    Message: message,
    ...extra,
  },
});

describe("parseInboundMessage (Evolution Go)", () => {
  it("parses a plain text message", () => {
    expect(parseInboundMessage(event({ conversation: "Olá, bom dia" }))).toEqual({
      phone: "5511999999999",
      jid: "5511999999999@s.whatsapp.net",
      pushName: "Fulano",
      type: "text",
      text: "Olá, bom dia",
      providerMessageId: "3EB0ABC",
      timestamp: Date.parse("2026-11-25T20:00:00-03:00") / 1000,
    });
  });

  it("reads extended text", () => {
    const msg = parseInboundMessage(event({ extendedTextMessage: { text: "link aqui" } }));
    expect(msg?.text).toBe("link aqui");
  });

  it("swaps an @lid chat for the real number in SenderAlt", () => {
    const msg = parseInboundMessage(
      event({ conversation: "oi" }, { Chat: "123@lid", SenderAlt: "5581988887777@s.whatsapp.net" }),
    );
    expect(msg?.jid).toBe("5581988887777@s.whatsapp.net");
    expect(msg?.phone).toBe("5581988887777");
  });

  it("keeps the @lid when no alternative number is sent", () => {
    const msg = parseInboundMessage(event({ conversation: "oi" }, { Chat: "123@lid" }));
    expect(msg?.jid).toBe("123@lid");
  });

  it("marks audio and keeps the raw message for download", () => {
    const audio = { audioMessage: { url: "x", mimetype: "audio/ogg" } };
    const msg = parseInboundMessage(event(audio));
    expect(msg?.type).toBe("audio");
    expect(msg?.rawMessage).toEqual(audio);
  });

  it("reads an image caption", () => {
    const msg = parseInboundMessage(event({ imageMessage: { caption: "foto" } }));
    expect(msg).toMatchObject({ type: "image", text: "foto" });
    expect(msg?.rawMessage).toBeUndefined();
  });

  it("returns null when the timestamp is unreadable", () => {
    const msg = parseInboundMessage(event({ conversation: "oi" }, { Timestamp: "nope" }));
    expect(msg?.timestamp).toBeNull();
  });

  it.each([
    ["our own echo", event({ conversation: "x" }, { IsFromMe: true })],
    ["a group", event({ conversation: "x" }, { Chat: "123@g.us", IsGroup: true })],
    ["a status broadcast", event({ conversation: "x" }, { Chat: "status@broadcast" })],
    ["an edit", event({ conversation: "x" }, {}, { IsEdit: true })],
    ["a reaction", event({ reactionMessage: { text: "👍" } })],
    ["a protocol message", event({ protocolMessage: {} })],
    ["a message without id", event({ conversation: "x" }, { ID: "" })],
    ["another event", { event: "Connected", data: {} }],
    ["garbage", null],
  ])("ignores %s", (_label, body) => {
    expect(parseInboundMessage(body)).toBeNull();
  });
});
