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
