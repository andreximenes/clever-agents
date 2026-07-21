"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export type PasswordState = { error?: string; success?: string } | null;

const passwordSchema = z
  .object({
    password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

/**
 * First-time password for an invited user. Allowed only while the account has
 * no password yet; afterwards the change flow (with the current password) applies.
 */
export async function setPassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const parsed = passwordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Abra o convite novamente." };

  if (user.user_metadata?.password_set) {
    return {
      error: "Você já tem uma senha. Use 'Minha conta' para alterá-la.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { password_set: true },
  });
  if (error) return { error: error.message };

  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") ? next : "/");
}

/** Changes the password of a signed-in user, verifying the current one first. */
export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!currentPassword) return { error: "Informe a senha atual" };

  const parsed = passwordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sessão expirada. Entre novamente." };

  // Re-authenticate so a stolen session alone can't change the password.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) return { error: "Senha atual incorreta" };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { password_set: true },
  });
  if (error) return { error: error.message };

  return { success: "Senha alterada com sucesso" };
}
