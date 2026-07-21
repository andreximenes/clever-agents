"use client";

import { useState } from "react";
import { BookOpen, Bot, Cpu, Smartphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentForm } from "./agent-form";
import type { AgentFormValues } from "./schema";

export type WorkspaceTab =
  | "agente"
  | "ia"
  | "whatsapp"
  | "conhecimento"
  | "acesso";

const TABS: { id: WorkspaceTab; label: string; icon: typeof Bot }[] = [
  { id: "agente", label: "Agente", icon: Bot },
  { id: "ia", label: "Inteligência", icon: Cpu },
  { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
  { id: "conhecimento", label: "Conhecimento", icon: BookOpen },
  { id: "acesso", label: "Acesso", icon: Users },
];

/**
 * Groups the agent screen by responsibility. The form stays mounted across
 * tabs (sections are hidden, not unmounted) so a single Save keeps every field.
 */
export function AgentWorkspace({
  agentId,
  canDelete,
  hasAiKey,
  hasEvolutionKey,
  defaultValues,
  platform,
  connection,
  documents,
  members,
}: {
  agentId: string;
  canDelete: boolean;
  hasAiKey: boolean;
  hasEvolutionKey: boolean;
  defaultValues: Partial<AgentFormValues>;
  platform?: {
    ai: { available: boolean; provider: string; model: string };
    evolution: { available: boolean; url: string };
  };
  connection: React.ReactNode;
  documents: React.ReactNode;
  members: React.ReactNode | null;
}) {
  const [active, setActive] = useState<WorkspaceTab>("agente");
  const visibleTabs = TABS.filter((t) => t.id !== "acesso" || members !== null);
  const isFormTab =
    active === "agente" || active === "ia" || active === "whatsapp";

  return (
    <div className="space-y-5">
      <nav
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition",
                selected
                  ? "border-[var(--color-primary)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Kept mounted so switching tabs never loses unsaved edits. */}
      <div className={cn(!isFormTab && "hidden")}>
        <AgentForm
          mode="edit"
          agentId={agentId}
          canDelete={canDelete}
          hasAiKey={hasAiKey}
          hasEvolutionKey={hasEvolutionKey}
          defaultValues={defaultValues}
          platform={platform}
          section={isFormTab ? active : "agente"}
        />
      </div>

      {active === "whatsapp" ? <div className="pt-1">{connection}</div> : null}
      {active === "conhecimento" ? documents : null}
      {active === "acesso" ? members : null}
    </div>
  );
}
