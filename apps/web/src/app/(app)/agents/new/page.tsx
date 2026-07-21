import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AgentForm } from "@/features/agents/agent-form";

export default async function NewAgentPage() {
  await requireUser();
  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft size={14} /> Voltar
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">Novo agente</h1>
      <AgentForm mode="create" />
    </div>
  );
}
