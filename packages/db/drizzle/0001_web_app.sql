CREATE TABLE "crawl_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"seen" integer DEFAULT 0 NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"in_area" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"delisted_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"payload" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "contact_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "list_hash" text;--> statement-breakpoint
ALTER TABLE "similar_suggestions" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "draft_condition" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "draft_phase" text;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_runs_source_idx" ON "crawl_runs" USING btree ("source","started_at");