import { getDb } from "@devote/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * 本番の設定診断（/admin 配下なので Basic 認証が必要）。
 * 環境変数は「設定されているか」だけを返し、値は返さない。
 */
const REQUIRED = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "ANTHROPIC_API_KEY",
  "APP_URL",
  "ADMIN_PASSWORD",
];
const OPTIONAL = [
  "DATABASE_URL_UNPOOLED",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "NEXT_PUBLIC_LINE_ADD_FRIEND_URL",
  "NEXT_PUBLIC_LINE_OA_ID",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "DEVOTE_CHAT_MODEL",
];
const TABLES = [
  "users",
  "chat_messages",
  "search_conditions",
  "properties",
  "listings",
  "crawl_runs",
  "source_usage",
];

export async function GET() {
  const env = Object.fromEntries(
    [...REQUIRED, ...OPTIONAL].map((k) => [k, Boolean(process.env[k])]),
  );
  let db: {
    connected: boolean;
    missingTables: string[];
    properties?: number;
    lastCrawl?: string | null;
    error?: string;
  };
  try {
    const rows = await getDb().execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    const missingTables = TABLES.filter((t) => !present.has(t));
    db = { connected: true, missingTables };
    if (missingTables.length === 0) {
      const [p] = await getDb().execute<{ n: number }>(
        sql`select count(*)::int as n from properties`,
      );
      const [c] = await getDb().execute<{ at: string | null }>(
        sql`select max(started_at)::text as at from crawl_runs`,
      );
      db.properties = p?.n ?? 0;
      db.lastCrawl = c?.at ?? null;
    }
  } catch (e) {
    db = {
      connected: false,
      missingTables: TABLES,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const problems = [
    ...REQUIRED.filter((k) => !env[k]).map((k) => `環境変数 ${k} が未設定です`),
    ...(!db.connected ? ["DB に接続できません"] : []),
    ...(db.connected && db.missingTables.length > 0
      ? ["DB のテーブルがありません（マイグレーション未実行）。再デプロイすると自動で作成されます"]
      : []),
    ...(db.connected && db.missingTables.length === 0 && !db.lastCrawl
      ? ["まだ巡回が実行されていません（GitHub Actions の Crawl & Notify を確認）"]
      : []),
  ];
  return Response.json({ ok: problems.length === 0, problems, env, db });
}
