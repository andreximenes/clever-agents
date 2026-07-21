CREATE TABLE "agent_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_members_agent_user_uq" UNIQUE("agent_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "agent_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_members_user_id_idx" ON "agent_members" USING btree ("user_id");