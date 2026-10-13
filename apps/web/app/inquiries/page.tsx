import { PropertyCard } from "@/components/property-card";
import { userInquiries } from "@/lib/data";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: "受付済み", className: "bg-stone-200" },
  checking: { label: "空室確認中", className: "bg-amber-100 text-amber-800" },
  available: { label: "ご紹介できます", className: "bg-brand-100 text-brand-900" },
  viewing_scheduled: { label: "内見日程調整済み", className: "bg-brand-100 text-brand-900" },
  unavailable: { label: "ご紹介できませんでした", className: "bg-red-100 text-red-800" },
  closed: { label: "完了", className: "bg-stone-200" },
};

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const userId = await currentUserId();
  const list = userId ? await userInquiries(userId) : [];
  return (
    <div className="space-y-6">
      {created && (
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
          問い合わせを受け付けました。担当者から連絡いたします。
        </p>
      )}
      <h1 className="text-xl font-bold">内見の問い合わせ</h1>
      {list.length === 0 && <p className="text-sm text-stone-600">まだ問い合わせはありません。</p>}
      {list.map((q) => (
        <section key={q.id} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-bold ${STATUS[q.status]?.className ?? ""}`}
            >
              {STATUS[q.status]?.label ?? q.status}
            </span>
            <span className="text-xs text-stone-500">
              {q.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
            </span>
          </div>
          <PropertyCard id={q.propertyId} listing={q.listing} />
          {q.suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold">代わりにこちらはいかがでしょうか</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {q.suggestions.map((s) => (
                  <PropertyCard key={s.id} id={s.propertyId} listing={s.listing} />
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
