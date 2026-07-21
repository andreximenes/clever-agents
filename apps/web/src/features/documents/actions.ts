"use server";

import { getDb, agentDocuments, agents } from "@clever/core/db";
import { decryptSecret } from "@clever/core/crypto";
import {
  detectKind,
  extractText,
  processDocument,
} from "@clever/core/documents";
import type { AgentAiConfig } from "@clever/core/ai";
import { and, eq } from "drizzle-orm";
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
