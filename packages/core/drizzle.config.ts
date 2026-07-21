import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the repo-root .env (cwd here is packages/core).
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // The `auth` schema is owned by Supabase — never diff or drop it.
  schemaFilter: ["public"],
});
