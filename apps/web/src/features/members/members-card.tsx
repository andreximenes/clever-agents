"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inviteAgentMember, removeAgentMember } from "./actions";

export type MemberItem = {
  id: string;
  email: string;
  name: string | null;
  pending: boolean;
};

export function MembersCard({
  agentId,
  ownerEmail,
  members,
}: {
  agentId: string;
  ownerEmail: string | null;
  members: MemberItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const onInvite = (formData: FormData) => {
    startTransition(async () => {
      const result = await inviteAgentMember(agentId, formData);
      if (result.ok) {
        toast.success(result.message);
        formRef.current?.reset();
      } else {
        toast.error(result.error);
      }
      router.refresh();
    });
  };

  const onRemove = (memberId: string) => {
    setRemovingId(memberId);
    startTransition(async () => {
      const result = await removeAgentMember(agentId, memberId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setRemovingId(null);
      router.refresh();
    });
  };

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Acesso ao agente</CardTitle>
        <CardDescription>
          Convide alguém por email para testar e editar este agente. A pessoa não
          poderá excluí-lo nem convidar outras.
        </CardDescription>
      </div>

      <form ref={formRef} action={onInvite} className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            name="email"
            type="email"
            placeholder="email@dominio.com"
            required
            disabled={isPending}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          Convidar
        </Button>
      </form>

      <ul className="space-y-2">
        <li className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail size={14} className="text-[var(--color-muted)]" />
            {ownerEmail ?? "—"}
          </div>
          <span className="text-xs text-[var(--color-muted)]">dono</span>
        </li>

        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Mail size={14} className="text-[var(--color-muted)]" />
                <span className="truncate">{m.email}</span>
                {m.pending ? (
                  <span className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-400">
                    convite pendente
                  </span>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(m.id)}
              disabled={isPending && removingId === m.id}
              aria-label={`Remover acesso de ${m.email}`}
            >
              <X size={15} />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
