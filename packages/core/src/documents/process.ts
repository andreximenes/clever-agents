import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { agentDocumentChunks } from "../db/schema.ts";
import {
  embedTexts,
  embeddingsAvailable,
  summarizeDocument,
  type AgentAiConfig,
} from "../ai/index.ts";
import { chunkText } from "./chunk.ts";
import { normalizeText } from "./extract.ts";

export type ProcessResult = {
  charCount: number;
  chunkCount: number;
  embedded: boolean;
  summary: string;
};

/**
 * Turns raw extracted text into stored knowledge: a summary (always) plus
 * chunks, embedded when a platform embeddings key is configured. Replaces any
 * existing chunks for the document, so it is safe to re-run.
 */
export async function processDocument(
  db: Database,
  aiCfg: AgentAiConfig,
  opts: { documentId: string; agentId: string; rawText: string },
): Promise<ProcessResult> {
  const text = normalizeText(opts.rawText);
  const summary = text ? await summarizeDocument(aiCfg, text) : "";
  const chunks = chunkText(text);
  const shouldEmbed = embeddingsAvailable() && chunks.length > 0;
  const embeddings = shouldEmbed ? await embedTexts(chunks) : null;

  await db
    .delete(agentDocumentChunks)
    .where(eq(agentDocumentChunks.documentId, opts.documentId));

  if (chunks.length > 0) {
    await db.insert(agentDocumentChunks).values(
      chunks.map((content, i) => ({
        documentId: opts.documentId,
        agentId: opts.agentId,
        chunkIndex: i,
        content,
        embedding: embeddings ? embeddings[i]! : null,
      })),
    );
  }

  return {
    charCount: text.length,
    chunkCount: chunks.length,
    embedded: Boolean(embeddings),
    summary,
  };
}
