import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb, agents, agentMembers } from "@clever/core/db";
import { desc, eq, inArray, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { AgentStatusBadge } from "@/features/agents/status-badge";

export default async function AgentsPage() {
  const user = await requireUser();
  const db = getDb();

  // Admins see everything; everyone else sees agents they own plus agents they
  // were invited to.
  let rows;
  if (user.role === "admin") {
    rows = await db.select().from(agents).orderBy(desc(agents.createdAt));
  } else {
    const memberships = await db
      .select({ agentId: agentMembers.agentId })
      .from(agentMembers)
      .where(eq(agentMembers.userId, user.id));
    const sharedIds = memberships.map((m) => m.agentId);

    rows = await db
      .select()
      .from(agents)
      .where(
        sharedIds.length > 0
          ? or(eq(agents.ownerId, user.id), inArray(agents.id, sharedIds))
          : eq(agents.ownerId, user.id),
      )
      .orderBy(desc(agents.createdAt));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agentes</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {user.role === "admin"
              ? "Todos os agentes da plataforma."
              : "Seus agentes de atendimento."}
          </p>
        </div>
        <Link href="/agents/new">
          <Button>
            <Plus size={16} />
            Novo agente
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <CardTitle>Nenhum agente ainda</CardTitle>
          <CardDescription>
            Crie seu primeiro agente para começar a atender no WhatsApp.
          </CardDescription>
          <Link href="/agents/new" className="mt-2">
            <Button>
              <Plus size={16} />
              Criar agente
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="transition hover:border-[var(--color-primary)]">
                <div className="flex items-start justify-between">
                  <CardTitle>{agent.name}</CardTitle>
                  <AgentStatusBadge status={agent.status} />
                </div>
                <CardDescription className="mt-2 line-clamp-2">
                  {agent.instructions || "Sem instruções ainda."}
                </CardDescription>
                <div className="mt-3 text-xs text-[var(--color-muted)]">
                  {agent.aiProvider} · {agent.aiModel} · debounce{" "}
                  {agent.debounceSeconds}s
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
