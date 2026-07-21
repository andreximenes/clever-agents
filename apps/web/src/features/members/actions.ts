"use server";

import { agentMembers, getDb } from "@clever/core/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageAgent, getAgentAccess } from "@/lib/agent-access";
import { agentInviteEmail, sendEmail } from "@/lib/email";
import { createAdminSupabase } from "@/lib/supabase/server";

export type MemberResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const emailSchema = z.string().email("Email inválido");

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Invites someone (by email) to collaborate on a single agent. Creates the
 * Supabase user when needed, links them to the agent, and emails the link.
 */
export async function inviteAgentMember(
  agentId: string,
  formData: FormData,
): Promise<MemberResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  if (!canManageAgent(access.role)) {
    return { ok: false, error: "Você não pode convidar pessoas neste agente" };
  }

  const parsed = emailSchema.safeParse(
    String(formData.get("email") ?? "").trim().toLowerCase(),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Email inválido" };
  }
  const email = parsed.data;

  const supabase = createAdminSupabase();
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) return { ok: false, error: listError.message };

  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === email,
  );

  let userId: string;
  let link = `${siteUrl()}/agents/${agentId}`;
  const isNewUser = !existing;

  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        // Invited users land on the "create your password" page first.
        redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(
          `/definir-senha?next=/agents/${agentId}`,
        )}`,
      },
    });
    if (error || !data?.user) {
      return { ok: false, error: error?.message ?? "Falha ao criar o convite" };
    }
    userId = data.user.id;
    link = data.properties?.action_link ?? link;
  }

  if (userId === access.agent.ownerId) {
    return { ok: false, error: "Essa pessoa já é a dona do agente" };
  }

  const db = getDb();
  await db
    .insert(agentMembers)
    .values({ agentId, userId, invitedBy: access.user.id })
    .onConflictDoNothing({
      target: [agentMembers.agentId, agentMembers.userId],
    });

  try {
    const { subject, html } = agentInviteEmail({
      agentName: access.agent.name,
      inviterName: access.user.name ?? access.user.email ?? "Um administrador",
      link,
      isNewUser,
    });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    // Access was granted; only the email failed. Say so instead of pretending.
    revalidatePath(`/agents/${agentId}`);
    return {
      ok: false,
      error: `Acesso liberado, mas o email não foi enviado: ${
        err instanceof Error ? err.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath(`/agents/${agentId}`);
  return { ok: true, message: `Convite enviado para ${email}` };
}

/** Revokes a person's access to the agent. */
export async function removeAgentMember(
  agentId: string,
  memberId: string,
): Promise<MemberResult> {
  const access = await getAgentAccess(agentId);
  if (!access) return { ok: false, error: "Agente não encontrado" };
  if (!canManageAgent(access.role)) {
    return { ok: false, error: "Você não pode remover pessoas neste agente" };
  }

  const db = getDb();
  await db
    .delete(agentMembers)
    .where(
      and(eq(agentMembers.id, memberId), eq(agentMembers.agentId, agentId)),
    );

  revalidatePath(`/agents/${agentId}`);
  return { ok: true, message: "Acesso removido" };
}
