import {
  crawlRuns,
  getDb,
  inquiries,
  properties,
  searchConditions,
  sourceUsage,
  userChannels,
  users,
} from "@devote/db";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "新規",
  checking: "確認中",
  available: "紹介可",
  viewing_scheduled: "内見調整済",
  unavailable: "対応不可",
  closed: "完了",
};

export default async function AdminPage() {
  const db = getDb();
  const [[props], [usersCount], [conds], [chans]] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) filter (where ${properties.status} = 'active')`,
        rent: sql<number>`count(*) filter (where ${properties.status} = 'active' and ${properties.dealType} = 'rent')`,
      })
      .from(properties),
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(searchConditions).where(eq(searchConditions.active, true)),
    db.select({ n: count() }).from(userChannels).where(eq(userChannels.active, true)),
  ]);
  const runs = await db
    .selectDistinctOn([crawlRuns.source])
    .from(crawlRuns)
    .orderBy(crawlRuns.source, desc(crawlRuns.startedAt));
  // 今月（JST）の従量課金ソースの利用量
  const jstNow = new Date(Date.now() + 9 * 3600_000);
  const monthStart = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const usage = await db
    .select({
      source: sourceUsage.source,
      kind: sourceUsage.kind,
      n: sql<number>`sum(${sourceUsage.count})::int`,
    })
    .from(sourceUsage)
    .where(gte(sourceUsage.day, monthStart))
    .groupBy(sourceUsage.source, sourceUsage.kind);
  const recent = await db
    .select({ q: inquiries, data: properties.data })
    .from(inquiries)
    .innerJoin(properties, eq(properties.id, inquiries.propertyId))
    .orderBy(desc(inquiries.createdAt))
    .limit(50);

  const stat = (label: string, v: number | string) => (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-2xl font-bold">{v}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">管理画面</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("掲載中の物件", `${props?.active ?? 0}（賃貸 ${props?.rent ?? 0}）`)}
        {stat("ユーザー", usersCount?.n ?? 0)}
        {stat("有効な条件", conds?.n ?? 0)}
        {stat("通知先", chans?.n ?? 0)}
      </div>

      <section>
        <h2 className="mb-2 font-bold">内見の問い合わせ</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="p-2">受付</th>
                <th className="p-2">状態</th>
                <th className="p-2">お客様</th>
                <th className="p-2">物件</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(({ q, data }) => (
                <tr key={q.id} className="border-t border-stone-100">
                  <td className="p-2 whitespace-nowrap">
                    {q.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </td>
                  <td className="p-2">{STATUS_LABEL[q.status]}</td>
                  <td className="p-2">{q.contactName}</td>
                  <td className="p-2">
                    <Link href={`/admin/inquiries/${q.id}`} className="text-brand-700 underline">
                      {(data as { title?: string }).title ?? "物件"}
                    </Link>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-stone-500">
                    問い合わせはまだありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {usage.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">今月の利用量（従量課金のあるソース）</h2>
          <ul className="space-y-1 rounded-xl border border-stone-200 bg-white p-4 text-sm">
            {usage.map((u) => (
              <li key={`${u.source}-${u.kind}`}>
                {u.source}：{u.kind === "list" ? "検索" : u.kind === "detail" ? "物件詳細" : "図面"}{" "}
                <span className="font-bold">{u.n.toLocaleString()}</span> / 6,000 件
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">巡回ソースの状況</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="p-2">ソース</th>
                <th className="p-2">状態</th>
                <th className="p-2">最終実行</th>
                <th className="p-2">一覧/取得/対象エリア</th>
                <th className="p-2">新着/更新/終了</th>
                <th className="p-2">エラー・警告</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-stone-500">
                    まだ巡回が実行されていません（GitHub Actions の crawl ワークフローを確認）
                  </td>
                </tr>
              )}
              {runs.map((run) => {
                return (
                  <tr key={run.source} className="border-t border-stone-100 align-top">
                    <td className="p-2 font-mono text-xs">{run.source}</td>
                    <td className="p-2">
                      {run.status === "succeeded" ? "✅" : run.status === "failed" ? "❌" : "⏳"}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {run.startedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    </td>
                    <td className="p-2">{`${run.seen} / ${run.fetched} / ${run.inArea}`}</td>
                    <td className="p-2">{`${run.newCount} / ${run.updatedCount} / ${run.delistedCount}`}</td>
                    <td className="p-2 text-xs text-red-700">
                      {run.error ?? ((run.warnings as string[]).slice(0, 2).join(" / ") || "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
