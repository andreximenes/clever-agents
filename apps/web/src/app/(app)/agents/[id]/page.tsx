import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, MessagesSquare } from "lucide-react";
import { getDb, agentDocuments, agentMembers } from "@clever/core/db";
import { desc, eq } from "drizzle-orm";
import { getAgentAccess, canManageAgent } from "@/lib/agent-access";
import { serverWebEnv } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AgentWorkspace } from "@/features/agents/agent-workspace";
import { AgentStatusBadge } from "@/features/agents/status-badge";
import { DocumentsSection } from "@/features/documents/documents-section";
import { ConnectionCard } from "@/features/whatsapp/connection-card";
import { MembersCard } from "@/features/members/members-card";

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAgentAccess(id);
  if (!access) notFound();
  const { agent, role } = access;
  const canManage = canManageAgent(role);

  const db = getDb();
  const docs = await db
    .select()
    .from(agentDocuments)
    .where(eq(agentDocuments.agentId, agent.id))
    .orderBy(desc(agentDocuments.createdAt));

  // People with access — only the owner/admin manages this list.
  let ownerEmail: string | null = null;
  let members: {
    id: string;
    email: string;
    name: string | null;
    pending: boolean;
  }[] = [];

  if (canManage) {
    const rows = await db
      .select()
      .from(agentMembers)
      .where(eq(agentMembers.agentId, agent.id));

    const supabase = createAdminSupabase();
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const byId = new Map((data?.users ?? []).map((u) => [u.id, u]));

    ownerEmail = byId.get(agent.ownerId)?.email ?? null;
    members = rows.map((m) => {
      const u = byId.get(m.userId);
      return {
        id: m.id,
        email: u?.email ?? "(usuário removido)",
        name: (u?.user_metadata?.name as string | undefined) ?? null,
        pending: !(u?.email_confirmed_at ?? u?.confirmed_at),
      };
    });
  }

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft size={14} /> Voltar
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{agent.name}</h1>
          <AgentStatusBadge status={agent.status} />
          {role === "member" ? (
            <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
              convidado
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Link href={`/agents/${agent.id}/conversas`}>
            <Button variant="secondary">
              <MessagesSquare size={16} />
              Conversas
            </Button>
          </Link>
          <Link href={`/agents/${agent.id}/playground`}>
            <Button variant="secondary">
              <MessageSquare size={16} />
              Testar conversa
            </Button>
          </Link>
        </div>
      </div>

      <AgentWorkspace
        agentId={agent.id}
        canDelete={canManage}
        hasAiKey={Boolean(agent.aiApiKeyEncrypted)}
        hasEvolutionKey={Boolean(agent.evolutionApiKeyEncrypted)}
        defaultValues={{
          name: agent.name,
          instructions: agent.instructions,
          debounceSeconds: agent.debounceSeconds,
          aiProvider: agent.aiProvider,
          aiModel: agent.aiModel,
          evolutionMode: agent.evolutionMode,
          evolutionUrl: agent.evolutionUrl ?? "",
          evolutionInstanceName: agent.evolutionInstanceName ?? "",
        }}
        connection={
          <ConnectionCard
            agentId={agent.id}
            initialStatus={agent.status}
            configured={Boolean(
              agent.evolutionInstanceName &&
                agent.evolutionUrl &&
                agent.evolutionApiKeyEncrypted,
            )}
            webhookUrl={`${serverWebEnv().WORKER_PUBLIC_URL}/webhook/evolution/${agent.id}?token=${agent.webhookToken}`}
          />
        }
        documents={
          <DocumentsSection
            agentId={agent.id}
            documents={docs.map((d) => ({
              id: d.id,
              filename: d.filename,
              status: d.status,
              summary: d.summary,
              chunkCount: d.chunkCount,
              embedded: d.embedded,
              sizeBytes: d.sizeBytes,
              error: d.error,
            }))}
          />
        }
        members={
          canManage ? (
            <MembersCard
              agentId={agent.id}
              ownerEmail={ownerEmail}
              members={members}
            />
          ) : null
        }
      />
    </div>
  );
}
