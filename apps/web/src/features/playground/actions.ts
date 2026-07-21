"use server";

import { agents, getDb } from "@clever/core/db";
import {
  resetPlayground,
  sendPlaygroundMessage,
} from "@clever/core/agent";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAgentAccess } from "@/lib/agent-access";

export type PlaygroundResult =
  | { ok: true; reply: string }
  | { ok: false; error: string };

export async function sendTestMessage(
  agentId: string,
  text: string,
): Promise<PlaygroundResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const clean = text.trim();
  if (!clean) return { ok: false, error: "Mensagem vazia" };

  const db = getDb();
  const result = await sendPlaygroundMessage(db, agentId, clean);
  if (result.ok) return { ok: true, reply: result.text };

  const messages: Record<string, string> = {
    no_messages: "Não foi possível montar a conversa",
    empty_reply: "O modelo retornou uma resposta vazia",
    error: result.error ?? "Falha ao gerar resposta",
  };
  return { ok: false, error: messages[result.reason] ?? "Falha" };
}

export async function clearTestConversation(agentId: string) {
  const access = await getAgentAccess(agentId);
  if (!access) return;
  const db = getDb();
  await resetPlayground(db, agentId);
  revalidatePath(`/agents/${agentId}/playground`);
}
