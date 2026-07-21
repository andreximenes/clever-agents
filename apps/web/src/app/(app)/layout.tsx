import Link from "next/link";
import { Bot, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className="mr-4 flex items-center gap-2 font-semibold"
            >
              <Bot size={18} className="text-[var(--color-primary)]" />
              Clever Agents
            </Link>
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              Agentes
            </Link>
            {user.role === "admin" ? (
              <Link
                href="/admin/users"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                <Users size={14} />
                Usuários
              </Link>
            ) : null}
          </nav>
          <UserMenu
            email={user.email}
            name={user.name}
            role={user.role}
            theme={user.theme}
            signOutAction={signOut}
          />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
