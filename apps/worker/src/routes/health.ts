import type { FastifyInstance } from "fastify";

export async function registerHealth(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "worker" }));
}
