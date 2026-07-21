import { conversations, getDb } from "@clever/core/db";
import { runConversationReply } from "@clever/core/agent";
import { eq } from "drizzle-orm";
import PgBoss from "pg-boss";
import type { FastifyBaseLogger } from "fastify";

const QUEUE = "reply";

let boss: PgBoss | null = null;

export type ReplyJobData = {
  conversationId: string;
  agentId: string;
  /** conversation.lastMessageAt at enqueue time (ISO). Used for debounce. */
  enqueuedAt: string;
};

/** Starts pg-boss (jobs live in the pgboss schema of the same Postgres). */
export async function initQueue(logger: FastifyBaseLogger): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  // Keep the pool small: the Supabase session pooler caps total clients.
  boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    max: Number(process.env.PGBOSS_POOL_MAX ?? 3),
  });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(QUEUE);
  logger.info("queue started");
  return boss;
}

/**
 * Schedules (or reschedules) a debounced reply. Each inbound message enqueues a
 * job that fires after `debounceSeconds`; the worker skips it if a newer message
 * arrived meanwhile, so only the last message in a burst produces a reply.
 */
export async function enqueueReply(
  data: ReplyJobData,
  debounceSeconds: number,
): Promise<void> {
  if (!boss) throw new Error("queue not started");
  await boss.send(QUEUE, data, {
    startAfter: debounceSeconds,
    retryLimit: 2,
    retryDelay: 30,
    expireInSeconds: 120,
  });
}

/** Registers the worker that runs the debounced reply pipeline. */
export async function registerReplyWorker(
  logger: FastifyBaseLogger,
): Promise<void> {
  if (!boss) throw new Error("queue not started");
  await boss.work<ReplyJobData>(QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { conversationId, enqueuedAt } = job.data;
      const db = getDb();
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!conv) continue;

      // Debounce: a message arrived after this job was scheduled → let the
      // later job handle the reply.
      if (conv.lastMessageAt.getTime() > new Date(enqueuedAt).getTime()) {
        logger.info({ conversationId }, "reply superseded by newer message");
        continue;
      }

      const result = await runConversationReply(db, conversationId, {
        send: true,
      });
      logger.info(
        {
          conversationId,
          ok: result.ok,
          sent: result.ok ? result.sent : false,
          reason: result.ok ? undefined : result.reason,
        },
        "reply processed",
      );
    }
  });
  logger.info("reply worker registered");
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}
