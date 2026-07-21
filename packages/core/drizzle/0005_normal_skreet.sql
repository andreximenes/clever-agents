CREATE TYPE "public"."theme" AS ENUM('light', 'dark');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "theme" "theme" DEFAULT 'dark' NOT NULL;