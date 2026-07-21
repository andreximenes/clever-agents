import type { Agent } from "@clever/core/db";
import { cn } from "@/lib/utils";

const LABELS: Record<Agent["status"], string> = {
  draft: "Rascunho",
  connecting: "Conectando",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro",
};

const STYLES: Record<Agent["status"], string> = {
  draft: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  connecting: "bg-yellow-500/15 text-yellow-400",
  connected: "bg-green-500/15 text-green-400",
  disconnected: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  error: "bg-red-500/15 text-red-400",
};

export function AgentStatusBadge({ status }: { status: Agent["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
