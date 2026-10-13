/**
 * デプロイ時のマイグレーション（Vercel のビルド、GitHub Actions から実行）。
 * 接続先が未設定ならスキップする（ローカルのビルドやプレビューで失敗させない）。
 * 直接接続（DATABASE_URL_UNPOOLED）を優先する。Neon の pooled 接続でも動くが、DDL は直接接続が安全。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL が未設定のためスキップします");
  process.exit(0);
}

const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
const here = dirname(fileURLToPath(import.meta.url));
try {
  await migrate(drizzle(client), { migrationsFolder: join(here, "..", "drizzle") });
  console.log("[migrate] マイグレーションを適用しました");
} catch (e) {
  console.error("[migrate] 失敗しました:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
