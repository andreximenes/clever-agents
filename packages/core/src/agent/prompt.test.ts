import { describe, expect, it } from "vitest";
import type { Message } from "../db/schema.ts";
import { buildModelMessages, buildSystemPrompt } from "./prompt.ts";

const message = (over: Partial<Message>): Message =>
  ({
    id: "m1",
    conversationId: "c1",
    direction: "in",
    type: "text",
    content: "",
    transcription: null,
    providerMessageId: null,
    createdAt: new Date(),
    ...over,
  }) as Message;

describe("buildModelMessages", () => {
  it("marks a transcribed audio so the model knows the contact spoke", () => {
    const [msg] = buildModelMessages([
      message({ type: "audio", transcription: "Bom dia, tudo bem?" }),
    ]);
    expect(msg).toEqual({
      role: "user",
      content: "[áudio transcrito] Bom dia, tudo bem?",
    });
  });

  it("marks an audio that could not be transcribed as such", () => {
    const [msg] = buildModelMessages([
      message({ type: "audio", transcription: null }),
    ]);
    expect(msg?.content).toBe("[áudio recebido, não foi possível transcrever]");
  });

  it("does not confuse an empty transcription with a successful one", () => {
    const [msg] = buildModelMessages([
      message({ type: "audio", transcription: "   " }),
    ]);
    expect(msg?.content).toBe("[áudio recebido, não foi possível transcrever]");
  });

  it("keeps plain text messages untouched", () => {
    const [msg] = buildModelMessages([message({ content: "Qual o preço?" })]);
    expect(msg).toEqual({ role: "user", content: "Qual o preço?" });
  });

  it("prefers an image caption over the generic marker", () => {
    const withCaption = buildModelMessages([
      message({ type: "image", content: "esse aqui serve?" }),
    ]);
    expect(withCaption[0]?.content).toBe("esse aqui serve?");

    const without = buildModelMessages([message({ type: "image" })]);
    expect(without[0]?.content).toBe("[imagem recebida]");
  });

  it("maps outbound messages to the assistant role", () => {
    const [msg] = buildModelMessages([
      message({ direction: "out", content: "Claro, posso ajudar" }),
    ]);
    expect(msg?.role).toBe("assistant");
  });

  it("drops messages with no readable content", () => {
    expect(buildModelMessages([message({ content: "  " })])).toEqual([]);
  });
});

describe("buildSystemPrompt", () => {
  it("tells the model that audio arrives transcribed", () => {
    const prompt = buildSystemPrompt({
      instructions: "",
      contactSummary: "",
      knowledge: "",
    });
    expect(prompt).toContain("[áudio transcrito]");
    expect(prompt).toContain("nunca deve dizer o contrário");
  });

  it("repeats the audio reminder after the contact memory", () => {
    const prompt = buildSystemPrompt({
      instructions: "Atenda bem",
      contactSummary: "Cliente prefere texto em vez de áudio.",
      knowledge: "## Base de conhecimento\n- preços",
    });
    // Order matters: a memory written while the agent still refused audio wins
    // over the platform rules unless the reminder comes after it.
    expect(prompt.indexOf("# Lembrete final")).toBeGreaterThan(
      prompt.indexOf("# Memória deste contato"),
    );
    expect(prompt.trimEnd().endsWith("sugira o contrário.")).toBe(true);
  });
});
