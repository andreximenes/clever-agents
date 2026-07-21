"use server";

import {
  getDb,
  agentDocumentChunks,
  agentDocuments,
  agents,
} from "@clever/core/db";
import { decryptSecret } from "@clever/core/crypto";
import {
  detectKind,
  extractText,
  processDocument,
} from "@clever/core/documents";
import type { AgentAiConfig } from "@clever/core/ai";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAgentAccess } from "@/lib/agent-access";
import { createAdminSupabase } from "@/lib/supabase/server";

const BUCKET = "agent-documents";

export type DocActionResult = { ok: true } | { ok: false; error: string };

export async function uploadDocument(
  agentId: string,
  formData: FormData,
): Promise<DocActionResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const agent = access.agent;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nenhum arquivo enviado" };
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return {
      ok: false,
      error: "Formato não suportado (use PDF, Excel, Word, TXT ou MD)",
    };
  }

  const db = getDb();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Create the row first so we have an id for the storage path.
  const [doc] = await db
    .insert(agentDocuments)
    .values({
      agentId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath: "",
      sizeBytes: file.size,
      status: "processing",
    })
    .returning({ id: agentDocuments.id });
  if (!doc) return { ok: false, error: "Falha ao registrar o documento" };

  const storagePath = `${agentId}/${doc.id}/${file.name}`;

  try {
    const supabase = createAdminSupabase();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const rawText = await extractText(buffer, kind);
    const aiCfg: AgentAiConfig = {
      provider: agent.aiProvider,
      apiKey: decryptSecret(agent.aiApiKeyEncrypted),
      model: agent.aiModel,
    };
    const result = await processDocument(db, aiCfg, {
      documentId: doc.id,
      agentId,
      rawText,
    });

    await db
      .update(agentDocuments)
      .set({
        storagePath,
        status: "ready",
        summary: result.summary,
        charCount: result.charCount,
        chunkCount: result.chunkCount,
        embedded: result.embedded,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(agentDocuments.id, doc.id));
  } catch (err) {
    await db
      .update(agentDocuments)
      .set({
        storagePath,
        status: "error",
        error: err instanceof Error ? err.message : "Erro ao processar",
        updatedAt: new Date(),
      })
      .where(eq(agentDocuments.id, doc.id));
    return {
      ok: false,
      error: `Falha ao processar: ${err instanceof Error ? err.message : "erro"}`,
    };
  }

  revalidatePath(`/agents/${agentId}`);
  return { ok: true };
}

export type DocumentPreview =
  | {
      ok: true;
      filename: string;
      summary: string;
      text: string;
      truncated: boolean;
      downloadUrl: string | null;
      charCount: number;
      chunkCount: number;
    }
  | { ok: false; error: string };

const PREVIEW_CHARS = 20_000;

/**
 * Content of an uploaded document: the extracted text (rebuilt from its chunks)
 * plus a short-lived link to the original file in storage.
 */
export async function getDocumentPreview(
  agentId: string,
  documentId: string,
): Promise<DocumentPreview> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };

  const db = getDb();
  const [doc] = await db
    .select()
    .from(agentDocuments)
    .where(
      and(
        eq(agentDocuments.id, documentId),
        eq(agentDocuments.agentId, agentId),
      ),
    )
    .limit(1);
  if (!doc) return { ok: false, error: "Documento não encontrado" };

  const chunks = await db
    .select({ content: agentDocumentChunks.content })
    .from(agentDocumentChunks)
    .where(eq(agentDocumentChunks.documentId, documentId))
    .orderBy(asc(agentDocumentChunks.chunkIndex));

  // Chunks overlap on purpose; join them and let the reader see the flow.
  const full = chunks.map((c) => c.content).join("\n\n");
  const truncated = full.length > PREVIEW_CHARS;

  let downloadUrl: string | null = null;
  if (doc.storagePath) {
    const supabase = createAdminSupabase();
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storagePath, 60 * 10);
    downloadUrl = data?.signedUrl ?? null;
  }

  return {
    ok: true,
    filename: doc.filename,
    summary: doc.summary,
    text: truncated ? full.slice(0, PREVIEW_CHARS) : full,
    truncated,
    downloadUrl,
    // Derive from the text so the count is right even for older rows.
    charCount: doc.charCount || full.length,
    chunkCount: doc.chunkCount,
  };
}

export async function deleteDocument(
  agentId: string,
  documentId: string,
): Promise<DocActionResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const agent = access.agent;

  const db = getDb();
  const [doc] = await db
    .select()
    .from(agentDocuments)
    .where(
      and(
        eq(agentDocuments.id, documentId),
        eq(agentDocuments.agentId, agentId),
      ),
    )
    .limit(1);
  if (!doc) return { ok: false, error: "Documento não encontrado" };

  if (doc.storagePath) {
    const supabase = createAdminSupabase();
    await supabase.storage.from(BUCKET).remove([doc.storagePath]);
  }
  // Chunks cascade-delete via the FK.
  await db.delete(agentDocuments).where(eq(agentDocuments.id, documentId));

  revalidatePath(`/agents/${agentId}`);
  return { ok: true };
}
