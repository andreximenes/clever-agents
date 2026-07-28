# Plano — WhatsApp Cloud API oficial (eliminar risco de ban)

Complementa o `PLAN.md`. Adiciona um segundo modo de conexão ao WhatsApp, usando a
API oficial da Meta, mantendo o modo atual (Baileys/QR) intacto e funcionando.

## Problema

Hoje toda conexão é Baileys via Evolution API: a plataforma emula o WhatsApp Web do
cliente. Funciona, mas a Meta trata clientes não-oficiais como violação — o número do
cliente pode ser banido sem aviso e sem recurso. Isso é inaceitável para vender o
produto a um negócio que depende daquele número.

## Objetivo

Permitir que um agente conecte a um número oficial da Meta Cloud API, sem risco de
ban, sem reescrever o pipeline de mensagens, e sem quebrar os agentes Baileys
existentes.

## Decisões tomadas (com André, 2026-07-21)

| Decisão | Escolha | Motivo |
|---|---|---|
| Como falar com a Cloud API | **Via Evolution**, `integration: "WHATSAPP-BUSINESS"` | A Evolution normaliza os eventos da Meta para o mesmo `MESSAGES_UPSERT` já consumido. O parser, o webhook por agente e o envio não mudam. |
| Adapter próprio na Graph API | **Adiado** | Não reduz risco de ban (ver abaixo); só reduz dependência da Evolution. Fazer quando/se a Evolution decepcionar. |
| Abstração `MessagingProvider` | **Cortada do escopo** | Com a Evolution como único provider, seria interface com uma implementação só — abstração prematura. Volta quando existir um segundo provider concreto. |
| Atendimento humano em paralelo | **Dois números** — oficial para o agente, app WhatsApp Business normal para o humano | A alternativa (Coexistence, mesmo número no app e na API) só é habilitável via Embedded Signup por Tech Provider aprovado pela Meta, o que a Evolution não faz. Ver "Descartado". |
| Modelo de credenciais | Cliente traz `phone_number_id`, `business_id` e token permanente | Embedded Signup exige virar Tech Provider + App Review. Fica para depois. |

## Por que a Rota A elimina o risco de ban

Com `integration: "WHATSAPP-BUSINESS"` a Evolution **não carrega o Baileys**. Ela vira
um proxy HTTP para `graph.facebook.com`. Do lado da Meta o tráfego é indistinguível de
uma chamada direta à Graph API: App, token, `phone_number_id`. Não há sessão de
WhatsApp Web nem fingerprint de biblioteca não-oficial para detectar.

Um adapter direto na Graph API **não seria mais seguro** — a diferença entre as duas
rotas é operacional, não de risco.

Continua existindo (idêntico em qualquer API oficial): queda de *quality rating* por
denúncia/bloqueio dos destinatários, e restrição por violação de política. O uso é
reativo (cliente escreve, agente responde na janela de 24h), que é o perfil de menor
risco da plataforma — e quando algo acontece é visível no Business Manager, com aviso
prévio e recurso.

## Custos

Modelo por mensagem da Meta (Brasil, vigente desde jul/2025):

| Categoria | Custo | Aplica? |
|---|---|---|
| **Service** — resposta dentro de 24h da mensagem do cliente | **R$ 0,00**, sem teto | Sim: é 100% do fluxo |
| Utility | ~R$ 0,04–0,05 | Só se houver disparo ativo |
| Authentication | ~R$ 0,15–0,19 | Não |
| Marketing | ~R$ 0,31–0,38 | Só em campanha |

Cloud API direto não tem taxa de plataforma. Sem BSP intermediário, o custo recorrente
por cliente fica em **R$ 0–50/mês** (essencialmente só o número). A cobrança da Meta
vai para a conta do cliente, não para a plataforma.

O custo real do projeto é burocracia de onboarding, não dinheiro.

## Modelo de dados

`evolutionMode` (`existing` | `create`) significa *como a instância é provisionada* — é
ortogonal ao tipo de conexão. Enum novo em vez de sobrecarregar aquele:

```ts
// packages/core/src/db/schema.ts
export const whatsappIntegrationEnum = pgEnum("whatsapp_integration", [
  "baileys", // WhatsApp Web não-oficial (padrão, comportamento atual)
  "cloud",   // Meta Cloud API oficial
]);

// em agents:
whatsappIntegration: whatsappIntegrationEnum("whatsapp_integration")
  .notNull()
  .default("baileys"),
metaPhoneNumberId: text("meta_phone_number_id"),
metaBusinessId: text("meta_business_id"),
metaAccessTokenEncrypted: text("meta_access_token_encrypted"),
```

Default `baileys` mantém os agentes existentes funcionando. A migração é só
`ALTER TABLE ADD COLUMN`, sem backfill.

Em modo `cloud`, `evolutionUrl` + `evolutionApiKey` continuam sendo os da plataforma
(o `usePlatformEvolution` já existente). O que é por cliente é o token da Meta.

## Etapas

### 1. Client — `packages/core/src/evolution/client.ts`

`createInstance` (linhas 89-102) deixa de hardcodar Baileys:

```ts
type CreateInstanceOptions =
  | { integration: "baileys" }
  | { integration: "cloud"; token: string; number: string; businessId: string };

async createInstance(instanceName: string, opts: CreateInstanceOptions) {
  const body = opts.integration === "cloud"
    ? {
        instanceName,
        integration: "WHATSAPP-BUSINESS",
        token: opts.token,          // token permanente da Meta
        number: opts.number,        // Phone Number ID
        businessId: opts.businessId,
        qrcode: false,
      }
    : { instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true };
  // ...
}
```

`sendText`, `getMediaBase64`, `setWebhook`, `connectionState`, `logout` e
`deleteInstance` **não mudam** — é o ganho inteiro desta rota.

### 2. Guard de integração (item mais crítico)

Um agente marcado como `cloud` mas rodando em Baileys por erro de configuração leva o
cliente a tomar ban achando que está protegido. Não pode depender de disciplina.

Novo método no client:

```ts
/** Integração real da instância no servidor, como o Evolution reporta. */
async instanceIntegration(instanceName: string): Promise<string | null>
```

lendo o campo `integration` do `fetchInstances`. Verificar em `connectWhatsapp` e
`checkWhatsapp`: se `agent.whatsappIntegration === "cloud"` e a instância não retornar
`WHATSAPP-BUSINESS`, marcar `status: "error"` com mensagem explícita e **recusar** ficar
`connected`. Nunca degradar em silêncio.

O mesmo número não pode estar nos dois modos: uma vez registrado na Cloud API ele sai
do app WhatsApp e não volta sem migração.

### 3. Server actions — `apps/web/src/features/whatsapp/actions.ts`

`connectWhatsapp` (linha 60) ramifica:

- **cloud**: valida `metaPhoneNumberId`, `metaBusinessId`, `metaAccessTokenEncrypted` →
  `createInstance` com as credenciais → `setWebhook` (URL inalterada:
  `/webhook/evolution/:agentId?token=`) → guard da etapa 2 → `connectionState`.
  Sem QR, sem pairing code, sem o retry de 1.5s. O `ConnectResult` já tem `qr`
  opcional, o tipo aguenta.
- **baileys**: fluxo atual, intocado.

`disconnectWhatsapp`: em cloud não há sessão, então `logout` não tem semântica. Mapear
"Desconectar" para `deleteInstance` + `status: "draft"`, ou esconder o botão e deixar
só "Excluir instância".

### 4. Formulário e UI

`apps/web/src/features/agents/schema.ts` (linhas 41-75) — hoje exige
`evolutionInstanceName` sempre e ignora campos Meta. Vira validação condicional:

```ts
whatsappIntegration: z.enum(["baileys", "cloud"]).default("baileys"),
metaPhoneNumberId: z.string().trim().default(""),
metaBusinessId: z.string().trim().default(""),
metaAccessToken: z.string().trim().default(""),  // vazio no update = manter
```

Com `superRefine`: em `cloud` na criação, os três são obrigatórios. Mesmo padrão de
"vazio = manter a chave atual" já usado em `aiApiKey`.

`features/agents/actions.ts` criptografa o token com `encryptSecret`, como as demais
chaves — o token nunca volta para o browser.

`features/whatsapp/connection-card.tsx`: em modo cloud, no lugar do QR, um bloco de
status ("Número oficial conectado · +55 11 …") e aviso sobre a janela de 24h.

### 5. Janela de 24h — `packages/core/src/agent/reply.ts`

Único ponto de comportamento que muda. Fora da janela, a Meta só aceita template
aprovado; texto livre é rejeitado. Antes do envio (linha 84):

```ts
if (agent.whatsappIntegration === "cloud" && hoursSinceLastInbound > 24) {
  return { ok: false, reason: "window_closed" };
}
```

Adicionar `"window_closed"` ao union de `reason`. Com debounce de 30s quase nunca
dispara — mas quando disparar, o log deve nomear a causa em vez de mostrar um 400
críptico da Meta.

O tratamento de `@lid` (linhas 112-114) fica: é inofensivo e ainda vale para Baileys.
Na Cloud API o `@lid` não existe — o telefone real sempre vem.

## Testes

- `client.test.ts` (novo): `createInstance` monta o body correto para cada integração,
  com `fetch` mockado. Sem rede.
- `reply`: janela de 24h fecha em `cloud`, não fecha em `baileys`.
- `evolution/webhook.test.ts`: **não muda**. Se quebrar, a premissa "payload idêntico"
  está errada e o plano precisa ser reavaliado.
- Manual, obrigatório antes de qualquer cliente: número oficial real; texto → resposta;
  áudio → transcrição; guard da etapa 2 sabotado de propósito para confirmar que barra.

## Observabilidade

Incluir `integration` no log estruturado de `apps/worker/src/routes/webhook.ts:53` e no
`reply`. Com os dois modos convivendo em produção, sem isso debugar vira adivinhação.

## Esforço

| Escopo | Estimativa |
|---|---|
| Etapas 1–3 (client, guard, actions) | ~1 dia |
| Etapas 4–5 (form, UI, janela de 24h) | ~1 dia |
| Testes + validação com número real | ~0,5–1 dia |
| **Total de código** | **~2,5–3 dias** |

O caminho crítico não é o código — é a verificação na Meta.

## Pré-requisitos (iniciar em paralelo)

1. Verificação de negócio na Meta Business — 1 a 5 dias, gargalo real.
2. Criar o App Meta; guardar App ID e App Secret.
3. Número dedicado que **não esteja** em nenhum WhatsApp (comum ou Business).
4. **Confirmar a versão da Evolution no VPS.** O suporte a Cloud API exige v2 recente.
   Checar *antes* de escrever código: é o único pressuposto capaz de derrubar o plano.

## Riscos

| Risco | Mitigação |
|---|---|
| Payload da Meta via Evolution difere do Baileys em algum campo | Validar com número real antes de mexer na UI. O parser é `passthrough`, então divergência aparece como campo ausente, não como crash |
| Download de mídia (áudio) se comportar diferente em cloud | Teste manual explícito; se falhar, `getMediaBase64` ganha ramo próprio via Graph |
| Versão da Evolution sem suporte adequado | Pré-requisito 4, verificado antes de começar |
| Implementação Cloud da Evolution é menos madura que a Baileys | Se decepcionar, escrever o adapter direto na Graph API (~3 dias) — o pipeline já estará isolado por trás do client |
| Agente cair em Baileys sem ninguém notar | Guard da etapa 2 — não é opcional |

## Descartado (e por quê)

**Coexistence** — desde maio/2025 a Meta permite o mesmo número ativo no app WhatsApp
Business e na Cloud API ao mesmo tempo, com espelhamento bidirecional e sync de até 6
meses de histórico 1:1. Seria a melhor UX possível: o cliente continua atendendo pelo
celular como hoje.

Descartado porque só é habilitável via Embedded Signup por BSP/Tech Provider aprovado
pela Meta — a Evolution não faz esse fluxo. Exigiria App Review + adapter próprio antes
de qualquer venda. Dois números resolvem o caso de uso hoje.

Outras limitações que pesaram: exige número com histórico real (não ativa em chip novo),
14 dias sem abrir o app derrubam a conexão, templates só pela API, e o agente passaria a
precisar de regra de handoff para não responder por cima do humano.

**Embedded Signup / Tech Provider** — onboarding em 3 cliques dentro do painel, no lugar
de o cliente colar credenciais do Business Manager. Projeto à parte; pré-requisito para
Coexistence e para escalar onboarding self-service.

**Adapter direto na Graph API** — ver "Decisões tomadas". Nota para quando for feito: a
Meta entrega **todos os números de todos os clientes numa única URL de webhook**. O
roteamento deixa de ser `/webhook/evolution/:agentId` e passa a ser por
`entry[].changes[].value.metadata.phone_number_id`, autenticado por HMAC SHA-256 no
header `X-Hub-Signature-256`, com handshake `GET` de verificação (`hub.challenge`). O
payload é em lote, então `parseInboundMessage` vira `parseInboundMessages(): InboundMessage[]`.

## Referências

- [Evolution API — WhatsApp Cloud API](https://doc.evolution-api.com/v2/en/integrations/cloudapi)
- [Meta — Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta — Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview)
- [Preços WhatsApp Business API no Brasil (2026)](https://payperwa.com/blog/whatsapp-business-api-pricing-brazil-2026)
