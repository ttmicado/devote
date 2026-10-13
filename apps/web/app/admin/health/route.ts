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
  // メール送信（Resend）の送信ドメインが認証済みか
  let resend: {
    domains: { name: string; status: string }[];
    fromDomain: string | null;
    error?: string;
  } | null = null;
  if (process.env.RESEND_API_KEY) {
    const fromDomain = process.env.MAIL_FROM?.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null;
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      const json = (await res.json()) as {
        data?: { name: string; status: string }[];
        message?: string;
      };
      resend = res.ok
        ? {
            domains: (json.data ?? []).map((d) => ({ name: d.name, status: d.status })),
            fromDomain,
          }
        : { domains: [], fromDomain, error: `${res.status}: ${json.message ?? ""}` };
    } catch (e) {
      resend = { domains: [], fromDomain, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const sendingDomain = resend?.domains.find((d) => d.name === resend?.fromDomain);

  // LINE: トークン・Webhook の設定・LINE から実際に Webhook を呼んだテスト
  const line = await checkLine();

  const problems = [
    ...REQUIRED.filter((k) => !env[k]).map((k) => `環境変数 ${k} が未設定です`),
    ...(!db.connected ? ["DB に接続できません"] : []),
    ...(db.connected && db.missingTables.length > 0
      ? ["DB のテーブルがありません（マイグレーション未実行）。再デプロイすると自動で作成されます"]
      : []),
    ...(!env.RESEND_API_KEY || !env.MAIL_FROM
      ? ["メール送信の設定（RESEND_API_KEY / MAIL_FROM）が未設定です"]
      : []),
    ...(resend?.error ? [`Resend の API に接続できません（${resend.error}）`] : []),
    ...(resend && !resend.error && !sendingDomain
      ? [`MAIL_FROM のドメイン（${resend.fromDomain ?? "不明"}）が Resend に登録されていません`]
      : []),
    ...(sendingDomain && sendingDomain.status !== "verified"
      ? [
          `送信ドメイン ${sendingDomain.name} が未認証です（状態: ${sendingDomain.status}）。DNS レコードを確認してください`,
        ]
      : []),
    ...line.problems,
    ...(db.connected && db.missingTables.length === 0 && !db.lastCrawl
      ? ["まだ巡回が実行されていません（GitHub Actions の Crawl & Notify を確認）"]
      : []),
  ];
  return Response.json({ ok: problems.length === 0, problems, env, db, resend, line: line.info });
}

async function checkLine() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const problems: string[] = [];
  const info: Record<string, unknown> = {};
  if (!token) {
    return {
      problems: ["LINE_CHANNEL_ACCESS_TOKEN が未設定です（LINE 連携・通知が動きません）"],
      info,
    };
  }
  if (!process.env.LINE_CHANNEL_SECRET) {
    problems.push("LINE_CHANNEL_SECRET が未設定です（連携コードを受け取れません）");
  }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  try {
    const bot = await fetch("https://api.line.me/v2/bot/info", { headers });
    if (!bot.ok) {
      problems.push(
        `LINE のアクセストークンが無効です（${bot.status}）。長期のチャネルアクセストークンを発行し直してください`,
      );
      return { problems, info };
    }
    const b = (await bot.json()) as { basicId?: string; displayName?: string };
    info.basicId = b.basicId;
    info.displayName = b.displayName;
    if (b.basicId && !process.env.NEXT_PUBLIC_LINE_OA_ID) {
      info.hint = `NEXT_PUBLIC_LINE_OA_ID に ${b.basicId} を設定すると、LINE 連携がワンタップになります`;
    }

    const ep = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", { headers });
    const e = (await ep.json()) as { endpoint?: string; active?: boolean };
    info.webhook = e;
    const expected = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/line/webhook`;
    if (!e.endpoint) {
      problems.push(
        `LINE の Webhook URL が未設定です。LINE Developers で ${expected} を設定してください`,
      );
    } else {
      if (e.endpoint !== expected) {
        problems.push(`LINE の Webhook URL（${e.endpoint}）が ${expected} と一致しません`);
      }
      if (!e.active) {
        problems.push(
          "LINE の「Webhookの利用」がオフです。LINE Developers の Messaging API 設定でオンにしてください",
        );
      }
      // LINE から実際に Webhook を呼んでもらう（署名の検証まで含めて確認できる）
      const t = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
        method: "POST",
        headers,
        body: JSON.stringify({ endpoint: e.endpoint }),
      });
      const r = (await t.json()) as {
        success?: boolean;
        statusCode?: number;
        reason?: string;
        detail?: string;
      };
      info.webhookTest = r;
      if (!r.success) {
        problems.push(
          r.statusCode === 401
            ? "LINE からの呼び出しが署名エラー（401）です。Vercel の LINE_CHANNEL_SECRET が、LINE Developers のチャネルシークレットと一致していません"
            : `LINE から Webhook を呼べませんでした（${r.statusCode ?? ""} ${r.reason ?? ""} ${r.detail ?? ""}）`,
        );
      }
    }
  } catch (err) {
    problems.push(
      `LINE の API に接続できません（${err instanceof Error ? err.message : String(err)}）`,
    );
  }
  return { problems, info };
}
