"use server";

import {
  getDb,
  agentDocumentChunks,
  agentDocuments,
  agents,
} from "@clever/core/db";
import type { Agent } from "@clever/core/db/schema";
import { decryptSecret } from "@clever/core/crypto";
import {
  detectKind,
  extractText,
  processDocument,
  toStorageName,
  type DocumentKind,
} from "@clever/core/documents";
import type { AgentAiConfig } from "@clever/core/ai";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAgentAccess } from "@/lib/agent-access";
import { createAdminSupabase } from "@/lib/supabase/server";

const BUCKET = "agent-documents";

export type DocActionResult = { ok: true } | { ok: false; error: string };

/**
 * Extracts text from a stored file and rebuilds the document's knowledge.
 * Shared by upload and retry — safe to re-run, chunks are replaced.
 */
async function ingest(
  agent: Agent,
  doc: { id: string; agentId: string; storagePath: string },
  buffer: Buffer,
  kind: DocumentKind,
): Promise<DocActionResult> {
  const db = getDb();
  try {
    const rawText = await extractText(buffer, kind);
    const aiCfg: AgentAiConfig = {
      provider: agent.aiProvider,
      apiKey: decryptSecret(agent.aiApiKeyEncrypted),
      model: agent.aiModel,
    };
    const result = await processDocument(db, aiCfg, {
      documentId: doc.id,
      agentId: doc.agentId,
      rawText,
    });

    await db
      .update(agentDocuments)
      .set({
        storagePath: doc.storagePath,
        status: "ready",
        summary: result.summary,
        charCount: result.charCount,
        chunkCount: result.chunkCount,
        embedded: result.embedded,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(agentDocuments.id, doc.id));

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar";
    await db
      .update(agentDocuments)
      .set({
        storagePath: doc.storagePath,
        status: "error",
        error: message,
        updatedAt: new Date(),
      })
      .where(eq(agentDocuments.id, doc.id));
    return { ok: false, error: `Falha ao processar: ${message}` };
  }
}

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

  // Storage keys reject accents and most punctuation; the original filename
  // is kept in the row above.
  const storagePath = `${agentId}/${doc.id}/${toStorageName(file.name)}`;

  const supabase = createAdminSupabase();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    // Nothing landed in storage, so leave the path empty — retry has no file
    // to work from and the row can only be deleted or re-uploaded.
    await db
      .update(agentDocuments)
      .set({
        status: "error",
        error: uploadError.message,
        updatedAt: new Date(),
      })
      .where(eq(agentDocuments.id, doc.id));
    revalidatePath(`/agents/${agentId}`);
    return { ok: false, error: `Falha ao enviar: ${uploadError.message}` };
  }

  const result = await ingest(
    agent,
    { id: doc.id, agentId, storagePath },
    buffer,
    kind,
  );
  revalidatePath(`/agents/${agentId}`);
  return result;
}

/**
 * Re-runs extraction and processing for a document whose file is already in
 * storage — for failures in extraction, summarization or embedding.
 */
export async function retryDocument(
  agentId: string,
  documentId: string,
): Promise<DocActionResult> {
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

  if (!doc.storagePath) {
    return {
      ok: false,
      error: "O arquivo não chegou a ser armazenado. Envie-o novamente.",
    };
  }

  const kind = detectKind(doc.filename, doc.mimeType);
  if (!kind) return { ok: false, error: "Formato não suportado" };

  const supabase = createAdminSupabase();
  const { data, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(doc.storagePath);
  if (downloadError || !data) {
    return {
      ok: false,
      error: `Falha ao baixar o arquivo: ${downloadError?.message ?? "não encontrado"}`,
    };
  }

  await db
    .update(agentDocuments)
    .set({ status: "processing", error: null, updatedAt: new Date() })
    .where(eq(agentDocuments.id, doc.id));

  const buffer = Buffer.from(await data.arrayBuffer());
  const result = await ingest(
    access.agent,
    { id: doc.id, agentId, storagePath: doc.storagePath },
    buffer,
    kind,
  );
  revalidatePath(`/agents/${agentId}`);
  return result;
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
