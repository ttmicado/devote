import type { Db } from "@devote/db";
import { type SQL, sql } from "drizzle-orm";

/**
 * 写真のない物件（代表値の掲載がレインズなど写真を取れないソース）に、名寄せで同じ部屋とみなした
 * ほかのソースの掲載の写真を入れる。
 * - 写真を取り込まないソース（noImageSourceIds: 他社の社名・ロゴ入り）の写真は使わない
 * - 掲載中の掲載を優先し、その中では更新の新しいものを使う
 * - propertyIds を渡すとその物件だけ、省略すると全物件が対象。何度実行しても同じ結果になる
 */
export async function fillPropertyImages(
  db: Db,
  noImageIds: readonly string[],
  propertyIds?: readonly string[],
): Promise<number> {
  if (propertyIds && propertyIds.length === 0) return 0;
  const excluded: SQL =
    noImageIds.length > 0
      ? sql`and l.source not in (${sql.join(
          noImageIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  const only: SQL = propertyIds
    ? sql`and p.id in (${sql.join(
        propertyIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`
    : sql``;
  const filled = await db.execute(sql`
    update properties p set data = jsonb_set(p.data, '{imageUrls}', src.images)
    from (
      select distinct on (l.property_id) l.property_id, l.data->'imageUrls' as images
      from listings l
      where l.property_id is not null
        and jsonb_typeof(l.data->'imageUrls') = 'array'
        and jsonb_array_length(l.data->'imageUrls') > 0
        ${excluded}
      order by l.property_id, (l.status = 'active') desc, l.updated_at desc
    ) src
    where p.id = src.property_id
      and jsonb_array_length(coalesce(p.data->'imageUrls', '[]'::jsonb)) = 0
      ${only}
    returning p.id`);
  return filled.length;
}
