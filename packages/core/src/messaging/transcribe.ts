import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { messages, type Agent } from "../db/schema.ts";
import { decryptSecret } from "../crypto.ts";
import { transcribeAudio, transcriptionAvailable } from "../ai/index.ts";
import { createEvolutionClient } from "../evolution/client.ts";

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; reason: "disabled" | "no_media" | "error"; error?: string };

/**
 * Downloads a received audio message from Evolution and stores its transcript
 * on the message, so the agent reads it like any other text.
 */
export async function transcribeInboundAudio(
  db: Database,
  agent: Agent,
  input: { messageId: string; providerMessageId: string | null },
): Promise<TranscriptionResult> {
  if (!transcriptionAvailable()) return { ok: false, reason: "disabled" };
  if (
    !input.providerMessageId ||
    !agent.evolutionUrl ||
    !agent.evolutionApiKeyEncrypted ||
    !agent.evolutionInstanceName
  ) {
    return { ok: false, reason: "no_media" };
  }

  try {
    const client = createEvolutionClient({
      baseUrl: agent.evolutionUrl,
      apiKey: decryptSecret(agent.evolutionApiKeyEncrypted),
    });
    const media = await client.getMediaBase64(
      agent.evolutionInstanceName,
      input.providerMessageId,
    );
    if (!media) return { ok: false, reason: "no_media" };

    const text = await transcribeAudio(media.base64, media.mimetype);
    if (!text) return { ok: false, reason: "no_media" };

    await db
      .update(messages)
      .set({ transcription: text })
      .where(eq(messages.id, input.messageId));

    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : "erro na transcrição",
    };
  }
}
