"use server";

import { agents, getDb } from "@clever/core/db";
import { decryptSecret } from "@clever/core/crypto";
import {
  createEvolutionClient,
  EvolutionError,
  type ConnectionState,
} from "@clever/core/evolution";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAgentAccess } from "@/lib/agent-access";
import { serverWebEnv } from "@/lib/env";

type AgentStatus =
  | "draft"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type ConnectResult =
  | {
      ok: true;
      qr?: string;
      pairingCode?: string;
      state: ConnectionState;
      status: AgentStatus;
      /** True when the instance had to be created on the Evolution server. */
      created?: boolean;
    }
  | { ok: false; error: string };

export type StatusResult =
  | { ok: true; state: ConnectionState; status: AgentStatus }
  | { ok: false; error: string };

function clientFor(agent: {
  evolutionUrl: string | null;
  evolutionApiKeyEncrypted: string | null;
}) {
  if (!agent.evolutionUrl || !agent.evolutionApiKeyEncrypted) return null;
  return createEvolutionClient({
    baseUrl: agent.evolutionUrl,
    apiKey: decryptSecret(agent.evolutionApiKeyEncrypted),
  });
}

function mapState(state: ConnectionState): AgentStatus {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  if (state === "close") return "disconnected";
  return "connecting";
}

/**
 * Ensures the instance exists (creating it when mode = "create"), points its
 * webhook at our worker, and returns a QR code to scan.
 */
export async function connectWhatsapp(agentId: string): Promise<ConnectResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const agent = access.agent;
  if (!agent.evolutionInstanceName) {
    return { ok: false, error: "Configure e salve a instância antes de conectar" };
  }
  const client = clientFor(agent);
  if (!client) {
    return {
      ok: false,
      error: "Preencha a URL e a API Key da Evolution e salve o agente",
    };
  }

  const instance = agent.evolutionInstanceName;
  const db = getDb();

  try {
    // If the instance isn't on the server (never created, or deleted), create
    // it — that is always what "Conectar" is meant to achieve.
    const exists = await client.instanceExists(instance);
    let qr: string | undefined;
    let pairing: string | undefined;
    let created = false;

    if (!exists) {
      const result = await client.createInstance(instance);
      created = true;
      qr = result.qrBase64;
      pairing = result.pairingCode;
    }

    const webhookUrl = `${serverWebEnv().WORKER_PUBLIC_URL}/webhook/evolution/${agentId}?token=${agent.webhookToken}`;
    await client.setWebhook(instance, webhookUrl);

    // Ask for a QR when creation didn't hand us one. A freshly created
    // instance can take a moment to produce it, so retry once.
    if (!qr) {
      const first = await client.connect(instance);
      qr = first.qrBase64;
      pairing = first.pairingCode;
      if (!qr) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const second = await client.connect(instance);
        qr = second.qrBase64;
        pairing = second.pairingCode;
      }
    }

    const state = await client.connectionState(instance);
    const status = state === "open" ? "connected" : "connecting";

    await db
      .update(agents)
      .set({ status, updatedAt: new Date() })
      .where(eq(agents.id, agentId));
    revalidatePath(`/agents/${agentId}`);

    return { ok: true, qr, pairingCode: pairing, state, status, created };
  } catch (err) {
    await db
      .update(agents)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(agents.id, agentId));
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao conectar",
    };
  }
}

/** Polls the live connection state and syncs the agent status. */
export async function checkWhatsapp(agentId: string): Promise<StatusResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const agent = access.agent;
  if (!agent.evolutionInstanceName) {
    return { ok: false, error: "Instância não configurada" };
  }
  const client = clientFor(agent);
  if (!client) return { ok: false, error: "Configuração da Evolution incompleta" };

  const db = getDb();
  try {
    const state = await client.connectionState(agent.evolutionInstanceName);
    const status = mapState(state);
    await db
      .update(agents)
      .set({ status, updatedAt: new Date() })
      .where(eq(agents.id, agentId));
    revalidatePath(`/agents/${agentId}`);
    return { ok: true, state, status };
  } catch (err) {
    // The instance vanished on the Evolution side: don't keep showing
    // "connected" from a stale row.
    if (err instanceof EvolutionError && err.status === 404) {
      await db
        .update(agents)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(agents.id, agentId));
      revalidatePath(`/agents/${agentId}`);
      return {
        ok: false,
        error: `A instância "${agent.evolutionInstanceName}" não existe mais no servidor Evolution.`,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao verificar status",
    };
  }
}

/** Logs the number out, keeping the instance so a new QR can be generated. */
export async function disconnectWhatsapp(
  agentId: string,
): Promise<StatusResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const agent = access.agent;
  if (!agent.evolutionInstanceName) {
    return { ok: false, error: "Instância não configurada" };
  }
  const client = clientFor(agent);
  if (!client) return { ok: false, error: "Configuração da Evolution incompleta" };

  const db = getDb();
  try {
    await client.logout(agent.evolutionInstanceName);
  } catch (err) {
    // Already logged out or missing — the desired end state is the same.
    if (!(err instanceof EvolutionError && err.status === 404)) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao desconectar",
      };
    }
  }

  await db
    .update(agents)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
  revalidatePath(`/agents/${agentId}`);
  return { ok: true, state: "close", status: "disconnected" };
}

/**
 * Deletes the instance on the Evolution server so it can be created from
 * scratch. Destructive on the Evolution side, not on our data.
 */
export async function deleteWhatsappInstance(
  agentId: string,
): Promise<StatusResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  const agent = access.agent;
  if (!agent.evolutionInstanceName) {
    return { ok: false, error: "Instância não configurada" };
  }
  const client = clientFor(agent);
  if (!client) return { ok: false, error: "Configuração da Evolution incompleta" };

  const db = getDb();
  try {
    // Logging out first makes deletion reliable across Evolution versions.
    try {
      await client.logout(agent.evolutionInstanceName);
    } catch {
      // Fine: it may already be logged out.
    }
    await client.deleteInstance(agent.evolutionInstanceName);
  } catch (err) {
    if (!(err instanceof EvolutionError && err.status === 404)) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao excluir a instância",
      };
    }
  }

  await db
    .update(agents)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
  revalidatePath(`/agents/${agentId}`);
  return { ok: true, state: "close", status: "draft" };
}
