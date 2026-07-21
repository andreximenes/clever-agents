import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AgentForm } from "@/features/agents/agent-form";
import { platformDefaults } from "@/lib/platform-defaults";

export default async function NewAgentPage() {
  await requireUser();
  const platform = platformDefaults();
  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft size={14} /> Voltar
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">Novo agente</h1>
      <AgentForm
        mode="create"
        platform={platform}
        defaultValues={{
          usePlatformAi: platform.ai.available,
          usePlatformEvolution: platform.evolution.available,
          aiProvider: platform.ai.available
            ? (platform.ai.provider as never)
            : undefined,
          aiModel: platform.ai.available ? platform.ai.model : undefined,
        }}
      />
    </div>
  );
}
