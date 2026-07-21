import { getDb, profiles } from "@clever/core/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  name: string | null;
};

/** Returns the current user + profile, or null if not authenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const db = getDb();
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? "user",
    name: profile?.name ?? null,
  };
}

/** Requires an authenticated user; redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Requires an admin; redirects home for non-admins. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
