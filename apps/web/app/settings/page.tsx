import Link from "next/link";
import {
  disconnectChannel,
  issueLineLinkCode,
  requestEmailVerification,
  updateNotificationSettings,
} from "@/app/actions";
import { ConditionSummary, PHASE_LABELS } from "@/components/condition-summary";
import { latestCondition, userChannelList } from "@/lib/data";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const FREQ = [
  { v: "instant", label: "すぐに（新着が見つかり次第）" },
  { v: "daily", label: "1日1回まとめて" },
  { v: "weekly", label: "週1回（月曜）まとめて" },
] as const;

const EMAIL_MSG: Record<string, string> = {
  sent: "確認メールを送りました。メール内のリンクを開くと登録が完了します。",
  verified: "メールアドレスを登録しました。",
  invalid: "メールアドレスの形式が正しくありません。",
  expired: "確認リンクの有効期限が切れています。もう一度登録してください。",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ lineCode?: string; email?: string }>;
}) {
  const { lineCode, email } = await searchParams;
  const userId = await currentUserId();
  const condition = userId ? await latestCondition(userId) : null;
  const channels = userId ? await userChannelList(userId) : [];
  const active = channels.filter((c) => c.active);
  const friendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">通知設定</h1>

      <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-bold">受け取り方法</h2>
        {active.length === 0 && (
          <p className="text-sm text-amber-700">
            まだ受け取り方法が登録されていません。LINE かメールを登録してください。
          </p>
        )}
        <ul className="space-y-2 text-sm">
          {active.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2"
            >
              <span>
                {c.channel === "line" ? "LINE" : "メール"}
                {c.channel === "email" && <span className="ml-2 text-stone-500">{c.address}</span>}
              </span>
              <form action={disconnectChannel}>
                <input type="hidden" name="channelId" value={c.id} />
                <button type="submit" className="text-xs text-stone-500 underline">
                  解除
                </button>
              </form>
            </li>
          ))}
        </ul>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-stone-200 p-4">
            <p className="font-bold text-[#06C755]">LINE（おすすめ）</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-600">
              <li>
                {friendUrl ? (
                  <a
                    href={friendUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 underline"
                  >
                    Devote 公式アカウントを友だち追加
                  </a>
                ) : (
                  "Devote 公式アカウントを友だち追加"
                )}
              </li>
              <li>下のボタンで連携コードを発行</li>
              <li>コード（6桁）をトークに送信</li>
            </ol>
            {lineCode ? (
              <p className="mt-3 rounded-lg bg-stone-100 py-3 text-center font-mono text-3xl font-bold tracking-widest">
                {lineCode}
              </p>
            ) : (
              <form action={issueLineLinkCode} className="mt-3">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#06C755] py-2 text-sm font-bold text-white"
                >
                  連携コードを発行
                </button>
              </form>
            )}
            {lineCode && <p className="mt-1 text-xs text-stone-500">有効期限は30分です。</p>}
          </div>
          <div className="rounded-lg border border-stone-200 p-4">
            <p className="font-bold">メール</p>
            {email && <p className="mt-2 text-sm text-brand-700">{EMAIL_MSG[email]}</p>}
            <form action={requestEmailVerification} className="mt-3 space-y-2">
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-stone-800 py-2 text-sm font-bold text-white"
              >
                確認メールを送る
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-bold">頻度と検討段階</h2>
        {!condition ? (
          <p className="mt-2 text-sm text-stone-600">
            先に{" "}
            <Link href="/chat" className="text-brand-700 underline">
              AIと条件を相談
            </Link>{" "}
            してください。
          </p>
        ) : (
          <form action={updateNotificationSettings} className="mt-3 space-y-5">
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-sm text-stone-500">通知の頻度</legend>
              {FREQ.map((f) => (
                <label key={f.v} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="frequency"
                    value={f.v}
                    defaultChecked={condition.frequency === f.v}
                  />
                  {f.label}
                </label>
              ))}
              <label className="mt-2 flex items-center gap-2 text-sm">
                まとめて送る時刻
                <select
                  name="sendHour"
                  defaultValue={condition.sendHour}
                  className="rounded border border-stone-300 px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h}時
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm text-stone-500">
                検討段階（届ける物件の厳選度）
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(PHASE_LABELS) as (keyof typeof PHASE_LABELS)[]).map((k) => (
                  <label
                    key={k}
                    className="cursor-pointer rounded-lg border border-stone-200 p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      name="phase"
                      value={k}
                      defaultChecked={condition.phase === k}
                      className="sr-only"
                    />
                    <span className="font-bold">{PHASE_LABELS[k].label}</span>
                    <span className="mt-1 block text-xs text-stone-500">
                      {PHASE_LABELS[k].help}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={condition.active} />
              通知を受け取る
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand-700 px-5 py-2 text-sm font-bold text-white"
            >
              保存
            </button>
          </form>
        )}
      </section>

      {condition && (
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="mb-3 font-bold">登録中の条件</h2>
          <ConditionSummary condition={condition.condition} />
          <Link href="/chat" className="mt-3 inline-block text-sm text-brand-700 underline">
            AIと条件を見直す
          </Link>
        </section>
      )}
    </div>
  );
}
