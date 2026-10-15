-- アクセルホーム（axel-home）を巡回対象から外した（2026-10-15）。
-- 巡回しないと掲載終了を判定できないため、取り込み済みの掲載を閉じ、ほかのソースで掲載中でない物件も閉じる。
-- 通知（掲載終了のお知らせ）は出さないので change_events には記録しない
UPDATE "listings" SET "status" = 'closed', "updated_at" = now()
WHERE "source" = 'axel-home' AND "status" = 'active';
--> statement-breakpoint
UPDATE "properties" p SET "status" = 'closed', "updated_at" = now()
WHERE p."status" = 'active'
  AND EXISTS (SELECT 1 FROM "listings" l WHERE l."property_id" = p."id" AND l."source" = 'axel-home')
  AND NOT EXISTS (SELECT 1 FROM "listings" l WHERE l."property_id" = p."id" AND l."status" = 'active');
