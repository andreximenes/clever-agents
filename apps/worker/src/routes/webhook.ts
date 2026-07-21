import { agents, getDb } from "@clever/core/db";
import { parseInboundMessage } from "@clever/core/evolution";
import {
  ingestInboundMessage,
  transcribeInboundAudio,
} from "@clever/core/messaging";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { enqueueReply } from "../queue.ts";

type WebhookRoute = {
  Params: { agentId: string };
  Querystring: { token?: string };
};

/**
 * Receives Evolution webhook events for an agent. Authenticated by the agent's
 * per-webhook token (query `?token=` or `x-webhook-token` header). Inbound
 * individual-chat messages are persisted; everything else is acknowledged and
 * ignored.
 */
export async function registerWebhook(app: FastifyInstance) {
  app.post<WebhookRoute>(
    "/webhook/evolution/:agentId",
    async (request, reply) => {
      const { agentId } = request.params;
      const token =
        request.query.token ??
        (request.headers["x-webhook-token"] as string | undefined);

      const db = getDb();
      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

      if (!agent) return reply.code(404).send({ error: "unknown agent" });
      if (!token || token !== agent.webhookToken) {
        return reply.code(401).send({ error: "invalid token" });
      }

      const message = parseInboundMessage(request.body);
      if (!message) {
        // Log why, otherwise "nothing happened" is impossible to debug.
        const body = request.body as {
          event?: string;
          data?: {
            key?: { fromMe?: boolean; remoteJid?: string };
            messageType?: string;
          };
        } | null;
        request.log.info(
          {
            agentId,
            event: body?.event,
            fromMe: body?.data?.key?.fromMe,
            remoteJid: body?.data?.key?.remoteJid,
            messageType: body?.data?.messageType,
          },
          "webhook ignored",
        );
        return reply.send({ ignored: true });
      }

      try {
        const result = await ingestInboundMessage(db, agentId, message);
        request.log.info(
          {
            agentId,
            phone: message.phone,
            type: message.type,
            conversationId: result.conversationId,
          },
          "inbound message ingested",
        );

        // Audio needs a transcript before the reply job builds the prompt.
        if (message.type === "audio") {
          const transcription = await transcribeInboundAudio(db, agent, {
            messageId: result.messageId,
            providerMessageId: message.providerMessageId,
          });
          request.log.info(
            {
              agentId,
              ok: transcription.ok,
              reason: transcription.ok ? undefined : transcription.reason,
              error: transcription.ok ? undefined : transcription.error,
            },
            "audio transcription",
          );
        }

        // Schedule a debounced reply. Ingestion must not fail if the queue does.
        try {
          await enqueueReply(
            {
              conversationId: result.conversationId,
              agentId,
              enqueuedAt: result.lastMessageAt.toISOString(),
            },
            agent.debounceSeconds,
          );
        } catch (queueErr) {
          request.log.error({ agentId, err: queueErr }, "failed to enqueue reply");
        }

        return reply.send({ ok: true, conversationId: result.conversationId });
      } catch (err) {
        request.log.error({ agentId, err }, "failed to ingest message");
        return reply.code(500).send({ error: "ingest failed" });
      }
    },
  );
}
