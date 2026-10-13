import Link from "next/link";
import { ConditionSummary, PHASE_LABELS } from "@/components/condition-summary";
import { PropertyCard } from "@/components/property-card";
import { userMatches } from "@/lib/data";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { confirmed } = await searchParams;
  const userId = await currentUserId();
  const { condition, items } = userId ? await userMatches(userId) : { condition: null, items: [] };

  if (!condition) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="font-bold">まだ希望条件が登録されていません</p>
        <p className="mt-2 text-sm text-stone-600">
          AIと条件を相談して、「この条件で通知を受け取る」を押してください。
        </p>
        <Link
          href="/chat"
          className="mt-4 inline-block rounded-full bg-brand-700 px-5 py-2.5 font-bold text-white"
        >
          AIに相談する
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmed && (
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
          条件を保存しました。通知の受け取り方法を
          <Link href="/settings" className="font-bold underline">
            通知設定
          </Link>
          で選んでください。
        </p>
      )}
      <details className="rounded-xl border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer font-bold">
          あなたの条件（{PHASE_LABELS[condition.phase].label}）
        </summary>
        <div className="mt-3">
          <ConditionSummary condition={condition.condition} />
          <Link href="/chat" className="mt-3 inline-block text-sm text-brand-700 underline">
            AIと条件を見直す
          </Link>
        </div>
      </details>
      <h1 className="text-xl font-bold">おすすめ物件 {items.length}件</h1>
      {items.length === 0 ? (
        <p className="text-sm text-stone-600">
          いまは条件に合う掲載中の物件がありません。新着が見つかり次第お知らせします。
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <PropertyCard
              key={m.propertyId}
              id={m.propertyId}
              listing={m.listing}
              score={m.score}
              reasons={m.reasons}
            />
          ))}
        </div>
      )}
    </div>
  );
}
