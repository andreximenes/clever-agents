"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";

const inviteSchema = z.object({ email: z.string().email("Email inválido") });

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function inviteUser(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  await requireAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email inválido" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      // Invited users create their password before reaching the dashboard.
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(
        "/definir-senha?next=/",
      )}`,
    },
  );
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: `Convite enviado para ${parsed.data.email}` };
}
