CREATE TYPE "public"."document_status" AS ENUM('processing', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "agent_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_document_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"status" "document_status" DEFAULT 'processing' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embedded" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_document_chunks" ADD CONSTRAINT "agent_document_chunks_document_id_agent_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."agent_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_document_chunks" ADD CONSTRAINT "agent_document_chunks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_documents" ADD CONSTRAINT "agent_documents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_document_chunks_agent_id_idx" ON "agent_document_chunks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_documents_agent_id_idx" ON "agent_documents" USING btree ("agent_id");