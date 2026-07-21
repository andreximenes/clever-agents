# Plano — Clever Agents (MVP)

Plataforma web para criar agentes de IA de atendimento via WhatsApp. Um admin convida usuários; cada usuário cria e gerencia seus próprios agentes; o admin enxerga todos. A plataforma cuida da integração com a Evolution API (instância, QR code, webhook) e o usuário traz suas próprias chaves de IA.

## Objetivo do MVP

Provar que é possível conversar com um agente de forma natural, via WhatsApp e via playground no painel, com memória entre conversas e comportamento humano (aguardar o usuário terminar de digitar).

## Critérios de sucesso

- Admin convida um usuário por email; usuário loga e cria um agente preenchendo o formulário (nome, instruções, provider de IA + chave, config do Evolution).
- Usuário pareia um número escaneando o QR code exibido no painel, sem tocar na Evolution API manualmente.
- Mensagem enviada no WhatsApp chega ao agente, respeita o debounce (default 60s, ajustável) e recebe resposta coerente.
- Agente lembra de conversas anteriores com o mesmo contato ("como ficou aquele orçamento?").
- Áudios recebidos são transcritos e respondidos como texto.
- Conversas reais aparecem no painel em tempo real; playground funciona sem WhatsApp pareado.

## Decisões tomadas (com André, 2026-07-20)

| Decisão | Escolha |
|---|---|
| Arquitetura do agente | App única multi-tenant — rotas `/webhook/:agentId`, isolamento lógico por linha no banco |
| Stack/hosting | Next.js (painel) + worker Node long-running, em Docker na VPS do André |
| Banco/Auth | Supabase (Postgres + Auth com convites + RLS + Realtime) |
| Evolution API | Dois modos: (a) **instância existente** — usuário passa URL + apiKey + instance name e a plataforma só configura o webhook nela; (b) **criar instância** — usuário passa URL + apiKey global e a plataforma cria a instância, gera QR e configura o webhook |
| Agentes por usuário | Vários (modelo 1:N desde o início) |
| Memória | Todas as mensagens persistidas; prompt recebe últimas N mensagens + resumo acumulado por contato |
| Tipos de mensagem | Texto + áudio (transcrição). Imagem: fallback educado pedindo texto |
| Teste de conversação | Playground no painel (canal `test`, mesmo pipeline) + tela de conversas reais em tempo real |
| Debounce | Default 60s, configurável por agente |

## Stack

- **Painel**: Next.js (App Router) + TypeScript strict + shadcn/ui + React Query onde couber; mutações via server actions validadas com Zod.
- **Worker**: Node + Fastify (webhooks Evolution, API do playground) + **pg-boss** para jobs com delay (debounce) rodando no próprio Postgres do Supabase — sem Redis.
- **IA**: Vercel AI SDK — interface única para OpenAI, Google, Anthropic e OpenRouter (os 4 providers do MVP). Transcrição de áudio pelo provider configurado quando suportado (Whisper/Gemini); senão fallback de texto.
- **DB**: Drizzle ORM + migrations versionadas. RLS do Supabase para o painel; worker usa conexão service-role.
- **Monorepo**: pnpm workspaces — `apps/web`, `apps/worker`, `packages/core` (schema Drizzle, tipos, pipeline do agente, clients Evolution/IA compartilhados).
- **Deploy**: Docker Compose na VPS (web + worker) atrás de Caddy/Traefik com TLS automático. Supabase gerenciado (cloud).

## Ambientes

- **Dev**: tudo em `localhost` (web + worker), Supabase cloud como banco. Fluxos de WhatsApp testados com Evolution mockada + playground; para testar WhatsApp real a partir do localhost, expor o worker via túnel (ex.: `cloudflared tunnel`), já que a Evolution precisa alcançar o webhook por URL pública.
- **MVP/testes**: deploy via Docker Compose na VPS do André, com domínio + TLS para os webhooks da Evolution.

## Arquitetura

```
WhatsApp ⇄ Evolution API (do usuário)
                │  webhook POST
                ▼
        worker (Fastify)  ──► valida token do webhook, persiste mensagem
                │              agenda/reagenda job de resposta (pg-boss, delay = debounce)
                ▼  job dispara (sem msg nova no intervalo)
        pipeline do agente:
          transcreve áudio → monta prompt (instruções + resumo do contato
          + últimas N msgs) → chama IA (AI SDK) → envia resposta via Evolution
          → atualiza resumo do contato
                │
                ▼
        Supabase Postgres (RLS) ◄── Next.js (painel: CRUD, QR, conversas via Realtime, playground)
```

Decisões-chave:

- **Debounce persistente**: cada mensagem recebida cancela o job pendente e agenda outro com `startAfter = debounce`. Sobrevive a restart do worker (fica no Postgres), e cada job é observável.
- **Webhook seguro**: URL `/webhook/evolution/:agentId` + token secreto por agente na query/header (a Evolution não assina payloads). Payload validado com Zod.
- **Chaves de terceiros criptografadas**: apiKey da Evolution e chaves de IA gravadas com AES-256-GCM usando `APP_ENCRYPTION_KEY` do ambiente; nunca retornadas ao front (write-only, exibe só últimos 4 chars).
- **Estrutura de prompt pré-pronta**: template com seções fixas (Papel, Regras da plataforma — não inventar, não sair do escopo, tom pt-BR — Instruções do usuário, Memória do contato). O usuário edita só o texto das instruções.
- **Papéis**: `admin` | `user` em `profiles`; RLS: user enxerga só seus agentes/conversas, admin enxerga tudo. Convite via `inviteUserByEmail` (service role, chamado por server action restrita a admin).

## Modelo de dados (essência)

```
profiles          id (= auth.users), role, name
agents            id, owner_id, name, instructions, debounce_seconds,
                  ai_provider, ai_api_key_encrypted, ai_model,
                  evolution_url, evolution_api_key_encrypted,
                  evolution_instance_id, webhook_token, status
contacts          id, agent_id, phone, name, summary, summary_updated_at
conversations     id, agent_id, contact_id, channel (whatsapp|test), last_message_at
messages          id, conversation_id, direction (in|out), type (text|audio|image),
                  content, transcription, provider_message_id, created_at
```

## Estrutura de arquivos

```
apps/
  web/                    # Next.js — feature-based
    src/features/auth/    # login, convites
    src/features/agents/  # CRUD, form, QR/pareamento
    src/features/conversations/  # lista + realtime + playground
  worker/
    src/routes/           # webhook evolution, playground API, health
    src/jobs/             # reply-debounce, update-summary
packages/
  core/
    src/db/               # schema Drizzle + migrations
    src/agent/            # pipeline: prompt builder, memória, transcrição
    src/evolution/        # client tipado (criar instância, QR, enviar msg)
    src/ai/               # factory de providers (AI SDK)
```

## Fases

1. **Fundação** — monorepo, Supabase (schema + RLS + migrations), auth, convite de usuário, CRUD de agente com chaves criptografadas.
2. **Evolution** — client tipado, criar instância, tela de pareamento com QR + status de conexão, configuração automática do webhook, recebimento e persistência de mensagens.
3. **Pipeline do agente** — debounce com pg-boss, prompt builder com template, memória (últimas N + resumo por contato), chamada via AI SDK, envio da resposta.
4. **Experiência** — transcrição de áudio, playground no painel, tela de conversas em tempo real (Supabase Realtime).
5. **Produção** — Sentry (web + worker), logs estruturados (pino), testes E2E dos fluxos críticos, Docker Compose + deploy na VPS.

Cada fase termina com o fluxo dela verificado de ponta a ponta (Evolution mockada até a fase 2).

## Testes

- **Unit (Vitest)**: prompt builder, lógica de debounce/reagendamento, criptografia de chaves, parsing de payloads da Evolution.
- **Integração**: rotas do worker contra Postgres local (payload Evolution → mensagem persistida → job agendado), com IA e Evolution mockadas.
- **E2E (Playwright)**: login → criar agente → playground responde; admin convida usuário.

## Observabilidade

- Sentry no Next.js e no worker (todo erro de pipeline com `agentId`/`conversationId` no contexto).
- Logs estruturados (pino) por evento do pipeline: recebido, agendado, reagendado, respondido, falhou.
- `/health` no worker + verificação periódica do status da instância Evolution (exibido no painel).

## Segurança

- RLS em todas as tabelas; worker é o único com service role.
- Chaves de terceiros criptografadas at-rest, write-only na API.
- Token secreto por webhook; rate limit nas rotas públicas do worker.
- Validação Zod em toda entrada externa (forms, webhooks, playground).

## Riscos

- **Evolution API é não-oficial** (risco de ban do número/mudanças de API): isolar tudo em `packages/core/evolution` atrás de uma interface — os próximos providers de WhatsApp implementam a mesma interface.
- **Custo de tokens do usuário**: memória limitada (resumo + últimas N msgs) e modelo configurável; registrar uso por conversa para futura tela de consumo.
- **Perda de timers**: resolvido pelo pg-boss (jobs persistidos).
- **Vazamento de chaves**: criptografia + write-only + nunca logar payloads com chave.

## Fora do MVP (registrado, não implementar)

- Billing/planos e limites de uso.
- Integrações Google Agenda/Calendar e demais.
- Outros providers de WhatsApp além da Evolution.
- Entendimento de imagem (fica o fallback por texto).

## Premissas assumidas (falar se discordar)

- UI em pt-BR.
- Retenção de memória: mensagens mantidas indefinidamente no MVP; resumo cobre "últimos meses" naturalmente (sem job de expurgo por enquanto).
- Supabase cloud (plano free/pro), não self-hosted.
