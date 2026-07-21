import { describe, expect, it } from "vitest";
import { parseInboundMessage } from "./webhook.ts";

const base = (message: unknown, extra: Record<string, unknown> = {}) => ({
  event: "messages.upsert",
  instance: "inst",
  data: {
    key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "ABC" },
    pushName: "Fulano",
    message,
    ...extra,
  },
});

describe("parseInboundMessage", () => {
  it("parses a plain text message", () => {
    const msg = parseInboundMessage(base({ conversation: "Olá, bom dia" }));
    expect(msg).toEqual({
      phone: "5511999999999",
      jid: "5511999999999@s.whatsapp.net",
      pushName: "Fulano",
      type: "text",
      text: "Olá, bom dia",
      providerMessageId: "ABC",
      timestamp: null,
    });
  });

  it("accepts the newer @lid identifiers", () => {
    const body = base({ conversation: "ola" });
    body.data.key.remoteJid = "44384510828771@lid";
    const msg = parseInboundMessage(body);
    expect(msg?.phone).toBe("44384510828771");
    expect(msg?.jid).toBe("44384510828771@lid");
    expect(msg?.text).toBe("ola");
  });

  it("parses an extended text message", () => {
    const msg = parseInboundMessage(
      base({ extendedTextMessage: { text: "resposta" } }),
    );
    expect(msg?.text).toBe("resposta");
    expect(msg?.type).toBe("text");
  });

  it("classifies audio messages", () => {
    const msg = parseInboundMessage(
      base({ audioMessage: { url: "x" } }, { messageType: "audioMessage" }),
    );
    expect(msg?.type).toBe("audio");
    expect(msg?.text).toBe("");
  });

  it("ignores our own outbound echoes (fromMe)", () => {
    const body = base({ conversation: "eco" });
    body.data.key.fromMe = true;
    expect(parseInboundMessage(body)).toBeNull();
  });

  it("ignores group messages", () => {
    const body = base({ conversation: "grupo" });
    body.data.key.remoteJid = "12345@g.us";
    expect(parseInboundMessage(body)).toBeNull();
  });

  it("ignores non messages.upsert events", () => {
    const body = { ...base({ conversation: "x" }), event: "connection.update" };
    expect(parseInboundMessage(body)).toBeNull();
  });

  it("returns null for malformed payloads", () => {
    expect(parseInboundMessage({ foo: "bar" })).toBeNull();
    expect(parseInboundMessage(null)).toBeNull();
  });
});
