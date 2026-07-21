import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@clever/core/db";
import { getPlaygroundHistory } from "@clever/core/agent";
import { getAgentAccess } from "@/lib/agent-access";
import { PlaygroundChat } from "@/features/playground/playground-chat";

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAgentAccess(id);
  if (!access) notFound();
  const { agent } = access;

  const db = getDb();
  const history = await getPlaygroundHistory(db, agent.id);
  const initialMessages = history
    .filter((m) => m.content.trim())
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  return (
    <div>
      <Link
        href={`/agents/${agent.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft size={14} /> Voltar ao agente
      </Link>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Testar {agent.name}</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Converse com o agente sem passar pelo WhatsApp. Usa as mesmas
          instruções, memória e base de conhecimento.
        </p>
      </div>
      <PlaygroundChat agentId={agent.id} initialMessages={initialMessages} />
    </div>
  );
}
