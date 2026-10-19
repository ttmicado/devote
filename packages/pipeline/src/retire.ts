import type { Db } from "@devote/db";
import { sql } from "drizzle-orm";

/**
 * 巡回をやめたソース（retiredSourceIds）の掲載を閉じ、ほかのソースで掲載中でない物件も閉じる。
 * 掲載終了の通知は出さない（change_events に記録しない）。何度実行しても同じ結果になる
 */
export async function closeRetiredSources(db: Db, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const closed = await db.execute(sql`
    update listings set status = 'closed', updated_at = now()
    where source in (${list}) and status = 'active'
    returning id`);
  await db.execute(sql`
    update properties p set status = 'closed', updated_at = now()
    where p.status = 'active'
      and exists (select 1 from listings l where l.property_id = p.id and l.source in (${list}))
      and not exists (select 1 from listings l where l.property_id = p.id and l.status = 'active')`);
  return closed.length;
}

/**
 * 写真を取り込まないソース（noImageSourceIds）の、取り込み済みの写真を消す。
 * 掲載（listings.data）と、物件（properties.data）の imageUrls を空にする。物件は、そのソースの掲載を代表値にして
 * いるものに加え、そのソースの写真を借りているもの（fillPropertyImages で入れた写真）も対象。
 * 消したあとは fillPropertyImages が、ほかのソースの写真があれば入れ直す。何度実行しても同じ結果になる
 */
export async function stripSourceImages(db: Db, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  // 物件を先に消す（借りた写真を、元の掲載の写真と比べて見つけるため）
  await db.execute(sql`
    update properties p set data = jsonb_set(p.data, '{imageUrls}', '[]'::jsonb)
    where jsonb_array_length(coalesce(p.data->'imageUrls', '[]'::jsonb)) > 0
      and (
        p.data->>'source' in (${list})
        or exists (
          select 1 from listings l
          where l.property_id = p.id and l.source in (${list}) and l.data->'imageUrls' = p.data->'imageUrls'
        )
      )`);
  const stripped = await db.execute(sql`
    update listings set data = jsonb_set(data, '{imageUrls}', '[]'::jsonb)
    where source in (${list}) and jsonb_array_length(coalesce(data->'imageUrls', '[]'::jsonb)) > 0
    returning id`);
  return stripped.length;
}
