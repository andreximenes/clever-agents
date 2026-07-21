import { and, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { agentDocumentChunks, agentDocuments } from "../db/schema.ts";
import { embedQuery, embeddingsAvailable } from "../ai/index.ts";

/** Always-on knowledge: one short summary per ready document. */
export async function getDocumentSummaries(db: Database, agentId: string) {
  return db
    .select({
      filename: agentDocuments.filename,
      summary: agentDocuments.summary,
    })
    .from(agentDocuments)
    .where(
      and(
        eq(agentDocuments.agentId, agentId),
        eq(agentDocuments.status, "ready"),
      ),
    );
}

/** On-demand semantic search over the agent's embedded chunks. */
export async function searchChunks(
  db: Database,
  agentId: string,
  query: string,
  k = 5,
) {
  if (!embeddingsAvailable()) return [];
  const queryEmbedding = await embedQuery(query);
  const similarity = sql<number>`1 - (${cosineDistance(
    agentDocumentChunks.embedding,
    queryEmbedding,
  )})`;
  return db
    .select({ content: agentDocumentChunks.content, similarity })
    .from(agentDocumentChunks)
    .where(
      and(
        eq(agentDocumentChunks.agentId, agentId),
        isNotNull(agentDocumentChunks.embedding),
      ),
    )
    .orderBy(desc(similarity))
    .limit(k);
}

/**
 * Hybrid knowledge context for a conversation: document summaries are always
 * included; relevant chunks are added when embeddings exist and a query is given.
 */
export async function buildKnowledgeContext(
  db: Database,
  agentId: string,
  query?: string,
): Promise<string> {
  const summaries = await getDocumentSummaries(db, agentId);
  const parts: string[] = [];

  if (summaries.length > 0) {
    parts.push(
      "## Base de conhecimento (resumos)\n" +
        summaries
          .filter((s) => s.summary)
          .map((s) => `- **${s.filename}**: ${s.summary}`)
          .join("\n"),
    );
  }

  if (query && embeddingsAvailable()) {
    const chunks = await searchChunks(db, agentId, query);
    if (chunks.length > 0) {
      parts.push(
        "## Trechos relevantes da base de conhecimento\n" +
          chunks.map((c) => c.content).join("\n\n---\n\n"),
      );
    }
  }

  return parts.join("\n\n");
}
