import { redirect } from "next/navigation";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "@/features/account/password-forms";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Landing page for invited users: they arrive here from the invite link with a
 * valid session but no password yet.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const target = next && next.startsWith("/") ? next : "/";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <CardTitle className="text-xl">Bem-vindo ao Clever Agents</CardTitle>
          <CardDescription>
            Defina uma senha para {user.email} e acesse a plataforma.
          </CardDescription>
        </div>
        <SetPasswordForm next={target} />
      </Card>
    </main>
  );
}
