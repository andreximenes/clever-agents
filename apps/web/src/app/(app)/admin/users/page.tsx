import { getDb, profiles } from "@clever/core/db";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { InviteForm } from "@/features/admin/invite-form";

export default async function AdminUsersPage() {
  await requireAdmin();

  const db = getDb();
  const roleRows = await db.select().from(profiles);
  const roleById = new Map(roleRows.map((p) => [p.id, p.role]));

  const supabase = createAdminSupabase();
  const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const users = data?.users ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Convide usuários por email. Eles definem a senha pelo link recebido.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Convidar usuário</CardTitle>
        <InviteForm />
      </Card>

      <Card className="p-0">
        <div className="border-b border-[var(--color-border)] px-5 py-3">
          <CardTitle>Membros ({users.length})</CardTitle>
        </div>
        <ul>
          {users.map((u) => {
            const role = roleById.get(u.id) ?? "user";
            const confirmed = Boolean(u.email_confirmed_at ?? u.confirmed_at);
            return (
              <li
                key={u.id}
                className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3 last:border-0"
              >
                <div>
                  <p className="text-sm">{u.email}</p>
                  <CardDescription>
                    {role === "admin" ? "Administrador" : "Usuário"}
                    {confirmed ? "" : " · convite pendente"}
                  </CardDescription>
                </div>
                <span className="text-xs text-[var(--color-muted)]">
                  {role}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
