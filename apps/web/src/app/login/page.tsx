"use client";

import { Suspense, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { signIn } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

/**
 * Explains why someone landed here from a broken invite link, instead of
 * silently showing a password form to a person who never set a password.
 */
function InviteNotice() {
  const reason = useSearchParams().get("erro");
  if (reason !== "convite_invalido") return null;
  return (
    <p className="mb-4 text-sm text-[var(--color-danger)]">
      Este link de convite é inválido ou já foi usado. Peça um novo convite a
      quem liberou seu acesso.
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <CardTitle className="text-xl">Clever Agents</CardTitle>
          <CardDescription>Entre para gerenciar seus agentes.</CardDescription>
        </div>
        <Suspense fallback={null}>
          <InviteNotice />
        </Suspense>
        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {state?.error ? (
            <p className="text-sm text-[var(--color-danger)]">{state.error}</p>
          ) : null}
          <SubmitButton />
        </form>
      </Card>
    </main>
  );
}
