const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

/** Sends a transactional email through Resend. */
export async function sendEmail({ to, subject, html }: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");
  const from = process.env.INVITE_FROM_EMAIL ?? "no-reply@alxit.com.br";

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Clever Agents <${from}>`,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Falha no envio do email: ${detail}`);
  }
}

/** Email body for an agent access invite. */
export function agentInviteEmail(input: {
  agentName: string;
  inviterName: string;
  link: string;
  isNewUser: boolean;
}): { subject: string; html: string } {
  const action = input.isNewUser
    ? "Criar minha senha e acessar"
    : "Abrir o agente";
  const intro = input.isNewUser
    ? `Você foi convidado por ${input.inviterName} para colaborar no agente <strong>${input.agentName}</strong> no Clever Agents. Clique no botão abaixo para definir sua senha e começar.`
    : `${input.inviterName} liberou seu acesso ao agente <strong>${input.agentName}</strong> no Clever Agents.`;

  return {
    subject: `Acesso ao agente ${input.agentName}`,
    html: `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f6fa;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#111827">Clever Agents</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">${intro}</p>
    <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#6b7280">
      Você poderá ver e editar esse agente — instruções, base de conhecimento e conexão com o WhatsApp — além de testá-lo no playground.
    </p>
    <a href="${input.link}" style="display:inline-block;background:#4f8cff;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">${action}</a>
    <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#9ca3af">
      Se você não esperava este convite, pode ignorar este email.
    </p>
  </div>
</div>`,
  };
}
