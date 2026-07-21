import { z } from "zod";

const schema = z.object({
  WORKER_PORT: z.coerce.number().int().positive().default(3001),
  WORKER_PUBLIC_URL: z.string().url(),
});

export type WorkerEnv = z.infer<typeof schema>;

export function workerEnv(): WorkerEnv {
  return schema.parse(process.env);
}
