import { type NormalizedListing, priceLabel, summarizeListing } from "@devote/core";
import { getDb, inquiries, properties, similarSuggestions } from "@devote/db";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { sendSimilarSuggestions, updateInquiryStatus } from "../../actions";

export const dynamic = "force-dynamic";

const STATUSES = [
  ["new", "新規"],
  ["checking", "空室・客付可否を確認中"],
  ["available", "紹介可（内見調整へ）"],
  ["viewing_scheduled", "内見日程調整済み"],
  ["unavailable", "対応不可 → 類似物件を提案"],
  ["closed", "完了"],
] as const;

const REASONS = [
  ["broker_refused", "元付が客付NG"],
  ["already_applied", "申込済み・成約済み"],
  ["condition_mismatch", "条件が合わない"],
  ["other", "その他"],
] as const;

const SENT: Record<string, string> = {
  sent: "お客様に送信しました",
  skipped: "送信先（LINE/メール）が未登録、または送信済みのため送っていません",
  failed: "送信に失敗しました（通知設定・環境変数を確認してください）",
};

export default async function AdminInquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { id } = await params;
  const { sent } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const [row] = await db
    .select({ q: inquiries, data: properties.data })
    .from(inquiries)
    .innerJoin(properties, eq(properties.id, inquiries.propertyId))
    .where(eq(inquiries.id, id));
  if (!row) notFound();
  const { q } = row;
  const l = row.data as NormalizedListing;
  const suggestions = await db
    .select({ s: similarSuggestions, data: properties.data })
    .from(similarSuggestions)
    .innerJoin(properties, eq(properties.id, similarSuggestions.propertyId))
    .where(eq(similarSuggestions.inquiryId, id))
    .orderBy(asc(similarSuggestions.rank));

  return (
    <PageShell wide>
      <div className="space-y-6">
        <Link href="/admin" className="text-sm text-evergreen-700 underline">
          ← 管理画面
        </Link>
        <h1 className="display font-mincho text-3xl text-evergreen-900">問い合わせ詳細</h1>

        <section className="grid gap-4 rounded-none border border-ink-900/15 bg-sand-50 p-5 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="font-bold">お客様</p>
            <p>{q.contactName}</p>
            {q.contactPhone && <p>☎ {q.contactPhone}</p>}
            {q.contactEmail && <p>✉ {q.contactEmail}</p>}
            {q.preferredDates != null && <p>希望日時: {String(q.preferredDates)}</p>}
            {q.message && <p className="whitespace-pre-wrap text-ink-500">{q.message}</p>}
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-bold">物件</p>
            <Link href={`/properties/${q.propertyId}`} className="text-evergreen-700 underline">
              {l.title ?? "物件"}
            </Link>
            <p>{priceLabel(l)}</p>
            <p className="text-ink-500">{summarizeListing(l)}</p>
            <p className="text-ink-500">
              元付: {l.agencyName ?? "不明"}／広告:{" "}
              {l.adAllowed == null ? "不明" : l.adAllowed ? "可" : "不可"}
            </p>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="text-evergreen-700 underline"
            >
              掲載元で確認
            </a>
          </div>
        </section>

        <form
          action={updateInquiryStatus}
          className="space-y-3 rounded-none border border-ink-900/15 bg-sand-50 p-5"
        >
          <input type="hidden" name="inquiryId" value={q.id} />
          <p className="font-bold">対応状況</p>
          <select
            name="status"
            defaultValue={q.status}
            className="w-full rounded border border-ink-900/25 px-2 py-2 text-sm"
          >
            {STATUSES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="reason"
            defaultValue={q.unavailableReason ?? "broker_refused"}
            className="w-full rounded border border-ink-900/25 px-2 py-2 text-sm"
          >
            {REASONS.map(([v, label]) => (
              <option key={v} value={v}>
                対応不可の理由: {label}
              </option>
            ))}
          </select>
          <textarea
            name="adminNote"
            defaultValue={q.adminNote ?? ""}
            rows={2}
            placeholder="社内メモ"
            className="w-full rounded border border-ink-900/25 px-2 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-evergreen-700 px-5 py-2 text-sm font-bold text-white"
          >
            更新
          </button>
        </form>

        {q.status === "unavailable" && (
          <section className="space-y-3 rounded-none border-2 border-sand-400 bg-sand-50 p-5">
            <p className="font-bold">類似物件の候補</p>
            <p className="text-xs text-ink-500">
              お客様に送る物件にチェックを入れて送信してください。選ばなかった候補も「却下」として記録し、今後の自動提案の精度向上に使います。
            </p>
            {sent && <p className="text-sm text-evergreen-700">{SENT[sent]}</p>}
            {suggestions.length === 0 ? (
              <p className="text-sm text-ink-500">条件に合う類似物件が見つかりませんでした。</p>
            ) : (
              <form action={sendSimilarSuggestions} className="space-y-2">
                <input type="hidden" name="inquiryId" value={q.id} />
                {suggestions.map(({ s, data }) => {
                  const c = data as NormalizedListing;
                  return (
                    <label
                      key={s.id}
                      className="flex gap-3 rounded-lg border border-ink-900/15 p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="approve"
                        value={s.id}
                        defaultChecked={s.adminDecision !== "rejected" && s.rank <= 3}
                      />
                      <span className="flex-1">
                        <span className="font-bold">{c.title ?? "物件"}</span>（類似度{" "}
                        {Math.round(s.similarity * 100)}%）
                        <br />
                        {priceLabel(c)}／{summarizeListing(c)}
                        {s.sentAt && (
                          <span className="ml-2 text-xs text-evergreen-700">送信済み</span>
                        )}
                      </span>
                      <Link
                        href={`/properties/${s.propertyId}`}
                        className="text-xs text-evergreen-700 underline"
                      >
                        詳細
                      </Link>
                    </label>
                  );
                })}
                <button
                  type="submit"
                  className="rounded-lg bg-evergreen-800 px-5 py-2 text-sm font-bold text-white"
                >
                  選んだ物件をお客様に送る
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </PageShell>
  );
}
