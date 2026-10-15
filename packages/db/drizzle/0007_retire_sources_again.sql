-- 0005 / 0006 は PR のブランチへの push 時に DB Migrate ワークフローで本番に適用されたが、
-- マージまでの間も本番の巡回はアクセルホーム・REIT FIND を回っていたため、内容が変わった掲載は active に戻りうる。
-- 巡回から外すコードが入るこの時点で、もう一度閉じる（何度実行しても同じ結果）
UPDATE "listings" SET "status" = 'closed', "updated_at" = now()
WHERE "source" IN ('axel-home', 'rf12') AND "status" = 'active';
--> statement-breakpoint
UPDATE "properties" p SET "status" = 'closed', "updated_at" = now()
WHERE p."status" = 'active'
  AND EXISTS (SELECT 1 FROM "listings" l WHERE l."property_id" = p."id" AND l."source" IN ('axel-home', 'rf12'))
  AND NOT EXISTS (SELECT 1 FROM "listings" l WHERE l."property_id" = p."id" AND l."status" = 'active');
