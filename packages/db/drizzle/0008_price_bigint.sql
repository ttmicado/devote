-- 価格（円）を int4 から bigint へ。21.4億円を超える売買物件（例: 25.5億円）が入らず、
-- そのソースの巡回が毎回失敗していた（2026-10-16）。int4 → int8 は値を失わない。
-- テーブルの書き直しで一時的にロックがかかるため、巡回の書き込みと重なったら待たずに失敗させる（DB Migrate を再実行する）
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "price" SET DATA TYPE bigint;
