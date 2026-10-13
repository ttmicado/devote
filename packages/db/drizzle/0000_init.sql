CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."change_type" AS ENUM('new', 'price_down', 'price_up', 'field_changed', 'delisted', 'relisted');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('line', 'instagram', 'email');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'checking', 'available', 'viewing_scheduled', 'unavailable', 'closed');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."notify_frequency" AS ENUM('instant', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."search_phase" AS ENUM('exploring', 'considering', 'ready');--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"property_id" uuid,
	"type" "change_type" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"unavailable_reason" text,
	"preferred_dates" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_listing_id" text NOT NULL,
	"url" text NOT NULL,
	"property_id" uuid,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"data" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"price" integer NOT NULL,
	"ad_allowed" boolean,
	"miss_count" smallint DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"condition_version" integer NOT NULL,
	"score" smallint NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"status" text NOT NULL,
	"property_ids" uuid[] NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_type" text NOT NULL,
	"dedupe_block_key" text,
	"data" jsonb NOT NULL,
	"price" integer NOT NULL,
	"area_sqm" real,
	"layout" text,
	"city" text,
	"lat" real,
	"lng" real,
	"feature_vec" vector(64),
	"embedding" vector(1024),
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"http_status" smallint NOT NULL,
	"content_sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"parser_version" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"condition" jsonb NOT NULL,
	"phase" "search_phase" DEFAULT 'exploring' NOT NULL,
	"frequency" "notify_frequency" DEFAULT 'daily' NOT NULL,
	"send_hour" smallint DEFAULT 19 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_ledger" (
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"notification_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "similar_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"similarity" real NOT NULL,
	"rank" smallint NOT NULL,
	"admin_decision" text,
	"admin_note" text,
	"user_reaction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"address" text NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_conditions" ADD CONSTRAINT "search_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_ledger" ADD CONSTRAINT "sent_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_ledger" ADD CONSTRAINT "sent_ledger_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "similar_suggestions" ADD CONSTRAINT "similar_suggestions_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "similar_suggestions" ADD CONSTRAINT "similar_suggestions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_events_detected_idx" ON "change_events" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "chat_messages_user_idx" ON "chat_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_listing_uq" ON "listings" USING btree ("source","source_listing_id");--> statement-breakpoint
CREATE INDEX "listings_property_idx" ON "listings" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_uq" ON "matches" USING btree ("user_id","property_id","condition_version");--> statement-breakpoint
CREATE INDEX "properties_block_idx" ON "properties" USING btree ("dedupe_block_key");--> statement-breakpoint
CREATE INDEX "properties_feature_hnsw" ON "properties" USING hnsw ("feature_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "raw_snapshots_source_fetched_idx" ON "raw_snapshots" USING btree ("source","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_conditions_user_version_uq" ON "search_conditions" USING btree ("user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sent_ledger_pk" ON "sent_ledger" USING btree ("user_id","property_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "user_channels_uq" ON "user_channels" USING btree ("channel","address");