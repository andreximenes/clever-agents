import { requireUser } from "@/lib/auth";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/account/password-forms";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Minha conta</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {user.email}
          {user.role === "admin" ? " · administrador" : ""}
        </p>
      </div>

      <Card className="space-y-4">
        <div>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>
            Informe a senha atual e escolha uma nova, com pelo menos 8
            caracteres.
          </CardDescription>
        </div>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
