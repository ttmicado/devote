import { getDb } from "@devote/db";
import { sql } from "drizzle-orm";

/**
 * 固定ウィンドウのレート制限。key ごとに windowSec 秒の窓で回数を数える（DB の upsert で原子的に加算）。
 * 上限以内なら true、超えたら false を返す。
 */
export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute<{ n: number }>(sql`
    insert into rate_limits (key, window_start, n)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), 1)
    on conflict (key, window_start) do update set n = rate_limits.n + 1
    returning n`);
  // 古い行の掃除は、ほぼ負荷にならない頻度（約1%）でついでに行う
  if (Math.random() < 0.01) {
    await db
      .execute(sql`delete from rate_limits where window_start < now() - interval '2 days'`)
      .catch((e) =>
        console.error(`[rate-limit] 掃除に失敗: ${e instanceof Error ? e.message : e}`),
      );
  }
  return Number(rows[0]?.n ?? 0) <= limit;
}

/** 接続元 IP（Vercel 等のプロキシが付ける x-forwarded-for の先頭、なければ x-real-ip） */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
