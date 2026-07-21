import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "../env.ts";
import * as schema from "./schema.ts";

/**
 * Trusted server-side connection (worker + Next.js server actions). It connects
 * through the Supabase pooler as the `postgres` role, which bypasses RLS —
 * ownership is enforced in application code. RLS still protects any access that
 * comes through supabase-js with a user JWT (e.g. client Realtime subscriptions).
 */
let client: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function sqlClient(): postgres.Sql {
  if (!client) {
    client = postgres(serverEnv().DATABASE_URL, {
      // Safe across both session and transaction pooler modes.
      prepare: false,
      // Supabase's session pooler caps total clients (15 on this plan) and the
      // web app, the worker and pg-boss all share it — keep pools small.
      max: Number(process.env.DATABASE_POOL_MAX ?? 4),
      idle_timeout: 20,
    });
  }
  return client;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(sqlClient(), { schema, casing: "snake_case" });
  }
  return dbInstance;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
