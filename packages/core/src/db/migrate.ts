import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Load the repo-root .env (cwd here is packages/core).
config({ path: "../../.env" });

/**
 * Applies drizzle-generated migrations (table DDL) then the idempotent
 * policies.sql (functions, triggers, RLS). Run with: pnpm db:migrate.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql);

  // pgvector must exist before the migration creates any `vector` column.
  console.log("Ensuring pgvector extension");
  await sql`create extension if not exists vector`;

  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  console.log("Applying drizzle migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });

  const policiesPath = fileURLToPath(new URL("./policies.sql", import.meta.url));
  console.log("Applying policies.sql");
  const policiesSql = await readFile(policiesPath, "utf8");
  await sql.unsafe(policiesSql);

  await sql.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
