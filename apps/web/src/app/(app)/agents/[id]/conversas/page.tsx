import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Mic, Image as ImageIcon } from "lucide-react";
import { getDb } from "@clever/core/db";
import { listConversations } from "@clever/core/messaging";
import { getAgentAccess } from "@/lib/agent-access";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

function formatWhen(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default async function ConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAgentAccess(id);
  if (!access) notFound();
  const { agent } = access;

  const db = getDb();
  const conversations = await listConversations(db, agent.id);

  return (
    <div>
      <Link
        href={`/agents/${agent.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft size={14} /> Voltar ao agente
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Conversas de {agent.name}</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Histórico completo por contato, do mais recente para o mais antigo.
        </p>
      </div>

      {conversations.length === 0 ? (
        <Card className="py-12 text-center">
          <CardTitle>Nenhuma conversa ainda</CardTitle>
          <CardDescription className="mt-1">
            As conversas aparecem aqui assim que alguém falar com o agente.
          </CardDescription>
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/agents/${agent.id}/conversas/${c.id}`}
                  className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-3.5 transition last:border-0 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-sm font-medium text-[var(--color-muted)]">
                    {(c.contactName ?? c.contactPhone).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {c.contactName ?? c.contactPhone}
                      </span>
                      {c.channel === "test" ? (
                        <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                          teste
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-[var(--color-muted)]">
                      {c.lastDirection === "out" ? (
                        <span className="text-[var(--color-primary)]">
                          Agente:
                        </span>
                      ) : null}
                      {c.lastType === "audio" ? <Mic size={13} /> : null}
                      {c.lastType === "image" ? <ImageIcon size={13} /> : null}
                      <span className="truncate">
                        {c.lastMessage?.trim()
                          ? c.lastMessage
                          : c.lastType === "audio"
                            ? "áudio"
                            : "—"}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-[var(--color-muted)]">
                      {formatWhen(c.lastMessageAt)}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                      <MessageCircle size={12} />
                      {c.messageCount}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
