import Fastify from "fastify";
import { registerHealth } from "./routes/health.ts";
import { registerWebhook } from "./routes/webhook.ts";

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 5 * 1024 * 1024,
  });

  await registerHealth(app);
  await registerWebhook(app);

  return app;
}
