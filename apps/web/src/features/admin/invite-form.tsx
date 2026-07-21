"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteUser } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enviando…" : "Convidar"}
    </Button>
  );
}

export function InviteForm() {
  const [state, formAction] = useActionState(inviteUser, null);

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex items-start gap-2">
      <div className="flex-1">
        <Input
          name="email"
          type="email"
          placeholder="email@dominio.com"
          required
        />
      </div>
      <SubmitButton />
    </form>
  );
}
