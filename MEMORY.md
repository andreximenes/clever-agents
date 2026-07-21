# Clever Agents — Status & Handoff

Última atualização: 2026-07-20. Onde o projeto está e como retomar.

## Onde paramos

- **Fase 1 — concluída e testada.** Monorepo, banco (Supabase + Drizzle + RLS),
  auth, CRUD de agentes, convite de usuários pelo admin.
- **Fase 2 — concluída e testada.** Integração Evolution: client tipado, worker
  Fastify recebendo webhooks e persistindo mensagens, tela de conexão (QR + status).
- **Fase 3 — concluída e testada.** O agente RESPONDE: debounce via pg-boss
  (rajada de mensagens → 1 resposta), pipeline de resposta (instruções + memória
  do contato + base de conhecimento → IA → envio via Evolution), memória do contato
  atualizada a cada resposta, e **playground** no painel (`/agents/[id]/playground`)
  para testar sem WhatsApp. Verificado via script (pipeline + debounce) e pela UI.
- **Compartilhamento de agente — concluído.** Dono/admin convida alguém por email
  (tabela `agent_members`) para **ver, editar e testar** um agente específico —
  sem poder excluí-lo nem convidar outras pessoas. Email enviado via **Resend**
  (link de convite gerado pelo Supabase `generateLink`), remetente em
  `INVITE_FROM_EMAIL`. Acesso centralizado em `apps/web/src/lib/agent-access.ts`
  e na função SQL `can_access_agent()` usada pelas policies RLS.
- **Base de conhecimento — concluída.** Upload de PDF/Excel/Word/TXT/MD por agente,
  extração + resumo + chunks (pgvector). Modo híbrido: resumo sempre + busca semântica.
- **Instruções do agente em Markdown** com editor no formulário.

Agente demo pronto para testar: **"Padaria do Zé (demo)"** (usa a chave OpenRouter
de teste do `.env`, com um documento de cardápio). Pode excluir quando quiser.

### Próximo passo — Fase 4 (experiência) e Fase 5 (produção)
- Transcrição de áudio (WhatsApp), tela de conversas reais em tempo real (Realtime).
- Sentry + logs estruturados, testes E2E, Docker Compose + deploy na VPS.
- Teste ao vivo do WhatsApp real (depende do Evolution do André — ver seção abaixo).

## Deploy (VPS OCI)

Servidor: `ubuntu@137.131.136.57` (Ubuntu 24.04, **arm64**, 4 vCPU / 23 GB).
Domínio: `clever-agents.alxit.com.br`. Código em `~/clever-agents`.

Stack em Docker Compose: **traefik** (TLS via Let's Encrypt) + **web** (:3000) +
**worker** (:3001). Uma única imagem serve os dois apps, com comandos diferentes.
Traefik roteia `/webhook` e `/health` para o worker; o resto para o painel.

```bash
./deploy.sh          # envia o código, rebuilda e reinicia (não toca no .env do servidor)
```

O `.env` de produção vive só no servidor (`~/clever-agents/.env`, permissão 600).
Usa a **mesma `APP_ENCRYPTION_KEY`** do ambiente local — se divergir, as chaves de
IA/Evolution já gravadas no banco não descriptografam.

Pegadinhas encontradas neste deploy:
- **Traefik < 3.5 não fala com Docker 29+** ("client version 1.24 is too old").
  Fixado em `traefik:v3.6`.
- **Firewall em duas camadas**: o iptables da instância já foi liberado (80/443,
  persistido), mas o **Security List do VCN** também precisa liberar — isso só
  pelo console do OCI.
- O domínio está atrás do **proxy da Cloudflare**; para o Let's Encrypt emitir,
  o registro precisa estar como "DNS only" ou usar desafio DNS-01.

## Como rodar

```bash
pnpm install
pnpm --filter @clever/worker start   # worker  → http://localhost:3001
pnpm dev:web                         # painel  → http://localhost:3000
```

Migrations: `pnpm db:generate` depois `pnpm db:migrate`.

**Login admin:** andreluizximenes@gmail.com (o primeiro usuário criado vira admin
automaticamente; a senha é definida pelo próprio usuário em "Minha conta").

## Decisões importantes

- **Banco:** Supabase cloud (projeto `elyzwnysgqafixhohfqh`, região sa-east-1).
  Postgres via pooler `aws-1-sa-east-1.pooler.supabase.com:5432`.
- **Primeiro usuário vira admin** automaticamente (trigger). Demais são convidados.
- **Chaves de terceiros** (IA/Evolution) criptografadas (AES-256-GCM), write-only.
  `APP_ENCRYPTION_KEY` no `.env` — perder essa chave = perder as chaves gravadas.
- **Embeddings** usam uma chave única de plataforma `EMBEDDINGS_API_KEY` (OpenAI-compatível,
  1536 dims). Sem ela, agentes rodam em modo "só resumo" (RAG desligado).
- **Evolution:** dois modos — instância existente (só configura webhook) ou criar nova.

## Para testar WhatsApp ao vivo (pendente)

Precisa do servidor Evolution do André: **URL + API Key + nome da instância** no
formulário do agente. Como a Evolution precisa alcançar o webhook por URL pública,
em dev usar túnel: `cloudflared tunnel --url http://localhost:3001` e apontar
`WORKER_PUBLIC_URL` no `.env` para a URL do túnel.

## Estrutura

- `apps/web` — Next.js 15 (painel).
- `apps/worker` — Fastify (webhooks Evolution, futura fila de respostas).
- `packages/core` — schema/db, crypto, `ai`, `documents`, `evolution`, `messaging`.
- `PLAN.md` — plano completo do MVP.
