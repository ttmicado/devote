CREATE TABLE "source_usage" (
	"source" text NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "source_usage_uq" ON "source_usage" USING btree ("source","day","kind");