import { z } from "zod";

/**
 * Server-side environment shared by every package that touches the database or
 * secrets (worker, Next.js server code, drizzle-kit). Client-only vars
 * (NEXT_PUBLIC_*) are validated inside apps/web, not here.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "APP_ENCRYPTION_KEY must be 32 bytes encoded as base64",
    }),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Parse and cache the server env. Throws a readable error if anything is missing. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
