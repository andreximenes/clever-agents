import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic, Image as ImageIcon } from "lucide-react";
import { getDb } from "@clever/core/db";
import { getConversationDetail } from "@clever/core/messaging";
import { getAgentAccess } from "@/lib/agent-access";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function dayLabel(date: Date): string {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string; conversationId: string }>;
}) {
  const { id, conversationId } = await params;
  const access = await getAgentAccess(id);
  if (!access) notFound();
  const { agent } = access;

  const db = getDb();
  const detail = await getConversationDetail(db, agent.id, conversationId);
  if (!detail) notFound();
  const { conversation, messages } = detail;

  // Group the timeline into day buckets so the history reads chronologically.
  const days: { label: string; items: typeof messages }[] = [];
  for (const message of messages) {
    const label = dayLabel(message.createdAt);
    const current = days.at(-1);
    if (current?.label === label) current.items.push(message);
    else days.push({ label, items: [message] });
  }

  return (
    <div>
      <Link
        href={`/agents/${agent.id}/conversas`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft size={14} /> Todas as conversas
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-semibold">
          {conversation.contactName ?? conversation.contactPhone}
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          {conversation.contactPhone}
          {conversation.channel === "test" ? " · conversa de teste" : ""} ·{" "}
          {messages.length} mensagens
        </p>
      </div>

      {conversation.contactSummary ? (
        <Card className="mb-4">
          <CardTitle className="text-sm">Memória deste contato</CardTitle>
          <CardDescription className="mt-1 whitespace-pre-wrap">
            {conversation.contactSummary}
          </CardDescription>
        </Card>
      ) : null}

      <Card className="space-y-4">
        {days.map((day) => (
          <section key={day.label} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs font-medium text-[var(--color-muted)]">
                {day.label}
              </span>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>

            {day.items.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.direction === "out" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2",
                    m.direction === "out"
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-text)]",
                  )}
                >
                  {m.type !== "text" ? (
                    <span className="mb-1 flex items-center gap-1.5 text-xs opacity-80">
                      {m.type === "audio" ? <Mic size={12} /> : <ImageIcon size={12} />}
                      {m.type === "audio" ? "áudio" : "imagem"}
                      {m.transcription ? " · transcrito" : ""}
                    </span>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm">
                    {m.transcription?.trim() ||
                      m.content.trim() ||
                      (m.type === "audio"
                        ? "(áudio sem transcrição)"
                        : "(sem conteúdo)")}
                  </p>
                  <span className="mt-1 block text-right text-[10px] opacity-70">
                    {m.createdAt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </section>
        ))}
      </Card>
    </div>
  );
}
