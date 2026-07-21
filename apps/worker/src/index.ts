import { config } from "dotenv";
// Load the repo-root .env (cwd here is apps/worker).
config({ path: "../../.env" });

import { buildServer } from "./server.ts";
import { workerEnv } from "./env.ts";
import { initQueue, registerReplyWorker, stopQueue } from "./queue.ts";

async function main() {
  const env = workerEnv();
  const app = await buildServer();

  await initQueue(app.log);
  await registerReplyWorker(app.log);

  await app.listen({ port: env.WORKER_PORT, host: "0.0.0.0" });
  app.log.info(`worker listening on ${env.WORKER_PUBLIC_URL}`);

  const shutdown = async () => {
    app.log.info("shutting down");
    await stopQueue();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
