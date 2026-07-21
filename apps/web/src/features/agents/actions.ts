"use server";

import { randomBytes } from "node:crypto";
import { getDb, agents } from "@clever/core/db";
import { encryptSecret } from "@clever/core/crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canManageAgent, getAgentAccess } from "@/lib/agent-access";
import {
  platformAiSecret,
  platformEvolutionSecret,
} from "@/lib/platform-defaults";
import { agentFormSchema } from "./schema";

export type ActionResult =
  | { ok: true; agentId: string }
  | { ok: false; error: string };

export async function createAgent(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = agentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const v = parsed.data;

  // Platform credentials are resolved here so they never reach the browser.
  const ai = v.usePlatformAi ? platformAiSecret() : null;
  if (v.usePlatformAi && !ai) {
    return { ok: false, error: "A plataforma não tem uma chave de IA configurada" };
  }
  if (!ai && !v.aiApiKey) {
    return { ok: false, error: "A chave da API de IA é obrigatória" };
  }

  const evolution = v.usePlatformEvolution ? platformEvolutionSecret() : null;
  if (v.usePlatformEvolution && !evolution) {
    return {
      ok: false,
      error: "A plataforma não tem um servidor Evolution configurado",
    };
  }

  const db = getDb();
  const [created] = await db
    .insert(agents)
    .values({
      ownerId: user.id,
      name: v.name,
      instructions: v.instructions,
      debounceSeconds: v.debounceSeconds,
      aiProvider: ai?.provider ?? v.aiProvider,
      aiModel: ai?.model ?? v.aiModel,
      aiApiKeyEncrypted: encryptSecret(ai?.apiKey ?? v.aiApiKey),
      evolutionMode: v.evolutionMode,
      evolutionUrl: evolution?.url ?? v.evolutionUrl ?? null,
      evolutionInstanceName: v.evolutionInstanceName || null,
      evolutionApiKeyEncrypted: evolution
        ? encryptSecret(evolution.apiKey)
        : v.evolutionApiKey
          ? encryptSecret(v.evolutionApiKey)
          : null,
      webhookToken: randomBytes(24).toString("base64url"),
      status: "draft",
    })
    .returning({ id: agents.id });

  if (!created) return { ok: false, error: "Falha ao criar o agente" };
  revalidatePath("/");
  return { ok: true, agentId: created.id };
}

export async function updateAgent(
  agentId: string,
  formData: FormData,
): Promise<ActionResult> {
  // Owner, admin and invited members may all edit.
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };

  const parsed = agentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const v = parsed.data;

  const ai = v.usePlatformAi ? platformAiSecret() : null;
  const evolution = v.usePlatformEvolution ? platformEvolutionSecret() : null;

  const db = getDb();
  await db
    .update(agents)
    .set({
      name: v.name,
      instructions: v.instructions,
      debounceSeconds: v.debounceSeconds,
      aiProvider: ai?.provider ?? v.aiProvider,
      aiModel: ai?.model ?? v.aiModel,
      // Empty key means "keep the current one".
      ...(ai
        ? { aiApiKeyEncrypted: encryptSecret(ai.apiKey) }
        : v.aiApiKey
          ? { aiApiKeyEncrypted: encryptSecret(v.aiApiKey) }
          : {}),
      evolutionMode: v.evolutionMode,
      evolutionUrl: evolution?.url ?? v.evolutionUrl ?? null,
      evolutionInstanceName: v.evolutionInstanceName || null,
      ...(evolution
        ? { evolutionApiKeyEncrypted: encryptSecret(evolution.apiKey) }
        : v.evolutionApiKey
          ? { evolutionApiKeyEncrypted: encryptSecret(v.evolutionApiKey) }
          : {}),
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  revalidatePath("/");
  revalidatePath(`/agents/${agentId}`);
  return { ok: true, agentId };
}

export async function deleteAgent(agentId: string): Promise<ActionResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  if (!canManageAgent(access.role)) {
    return { ok: false, error: "Convidados não podem excluir o agente" };
  }

  const db = getDb();
  await db.delete(agents).where(eq(agents.id, agentId));
  revalidatePath("/");
  return { ok: true, agentId };
}
