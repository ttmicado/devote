import { getDb, users } from "@devote/db";
import { eq } from "drizzle-orm";
import {
  disconnectChannel,
  issueLineLinkCode,
  requestEmailVerification,
  updateNotificationSettings,
} from "@/app/actions";
import { ConditionSummary } from "@/components/condition-summary";
import { PageShell } from "@/components/page-shell";
import { ButtonLink, Eyebrow, Notice, PageHeader, Toast } from "@/components/ui";
import { PREFERENCES as T } from "@/lib/copy";
import { latestCondition, userChannelList } from "@/lib/data";
import { currentUserId } from "@/lib/session";
import { LineLinkWatcher } from "./line-link-watcher";

export const dynamic = "force-dynamic";

const PHASE_ORDER = ["exploring", "considering", "ready"] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    lineCode?: string;
    email?: string;
    saved?: string;
    welcome?: string;
    linked?: string;
  }>;
}) {
  const { lineCode, email, saved, welcome, linked } = await searchParams;
  const userId = await currentUserId();
  const condition = userId ? await latestCondition(userId) : null;
  const channels = userId ? await userChannelList(userId) : [];
  const [me] = userId
    ? await getDb().select({ loginId: users.loginId }).from(users).where(eq(users.id, userId))
    : [];
  const active = channels.filter((c) => c.active);
  const lineLinked = active.some((c) => c.channel === "line");
  const friendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL;
  const oneTap = Boolean(process.env.NEXT_PUBLIC_LINE_OA_ID);
  const emailMessage = email ? T.email.messages[email as keyof typeof T.email.messages] : null;

  return (
    <PageShell>
      <PageHeader eyebrow={T.eyebrow} title={T.title} lead={T.lead} />

      <div className="mt-8 space-y-4" aria-live="polite">
        {welcome && (
          <Toast>
            承りました。合う物件が見つかり次第お届けします。最後に、受け取り方をお選びください。
          </Toast>
        )}
        {saved && <Toast>{T.saved}</Toast>}
        {linked && <Toast>LINE と連携しました。ご希望に適う物件を、LINE にお届けします。</Toast>}
      </div>

      {!me?.loginId && (
        <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-ink-900/15 py-4 text-sm leading-7 text-ink-500">
          ほかの端末やブラウザからも同じ内容をご覧いただくには、アカウントをお作りください。
          <ButtonLink href="/account" variant="ghost" arrow>
            アカウントを作る
          </ButtonLink>
        </p>
      )}

      {/* 受け取り方 */}
      <section className="mt-14" aria-labelledby="channels">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="channels" className="display font-mincho text-2xl text-evergreen-900">
            {T.channelsTitle}
          </h2>
          {active.length === 0 && <p className="text-sm text-sand-600">{T.noChannel}</p>}
        </div>

        {active.length > 0 && (
          <ul className="mt-6 divide-y divide-ink-900/10 border-y border-ink-900/15">
            {active.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="eyebrow text-sand-600">{c.channel === "line" ? "LINE" : "Email"}</p>
                  <p className="mt-1 text-sm text-ink-900">
                    {c.channel === "line" ? "LINE にお届けします" : c.address}
                  </p>
                </div>
                <form action={disconnectChannel}>
                  <input type="hidden" name="channelId" value={c.id} />
                  <button
                    type="submit"
                    className="min-h-11 rounded-full border border-ink-900/20 px-5 text-xs tracking-[0.12em] text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900"
                  >
                    {T.disconnect}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 grid gap-px border border-ink-900/15 bg-ink-900/15 md:grid-cols-[1.15fr_1fr]">
          {/* LINE（おすすめ） */}
          <div className="relative overflow-hidden bg-evergreen-900 p-8 text-sand-100 sm:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-evergreen-700/40 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center gap-3">
                <Eyebrow tone="dark">LINE</Eyebrow>
                <span className="eyebrow rounded-full border border-sand-200/40 px-2.5 py-0.5 text-[10px] text-sand-200">
                  {T.line.recommended}
                </span>
              </div>
              <h3 className="display mt-4 font-mincho text-2xl text-sand-50">{T.line.title}</h3>

              {lineLinked ? (
                <p className="mt-6 text-sm leading-7 text-sand-200">LINE と連携済みです。</p>
              ) : oneTap ? (
                <>
                  <p className="mt-4 text-sm leading-7 text-sand-200">
                    ボタンを押すと LINE が開きます。そのまま送信すると連携が完了します。
                  </p>
                  <form action={issueLineLinkCode} className="mt-8">
                    <button
                      type="submit"
                      className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-sand-200 px-8 text-sm tracking-[0.12em] text-evergreen-900 transition-colors duration-500 hover:bg-sand-50"
                    >
                      {T.line.oneTap} →
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <ol className="mt-6 space-y-3">
                    {T.line.steps.map((s, i) => (
                      <li key={s} className="flex gap-4 text-sm leading-7 text-sand-200">
                        <span className="font-serif text-lg leading-7 text-sand-300">0{i + 1}</span>
                        {i === 0 && friendUrl ? (
                          <a
                            href={friendUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-sand-300/60 underline-offset-4 hover:text-sand-50"
                          >
                            {s}
                          </a>
                        ) : (
                          s
                        )}
                      </li>
                    ))}
                  </ol>
                  {lineCode ? (
                    <div className="mt-8 border-t border-sand-100/15 pt-6">
                      <p className="eyebrow text-sand-300">Link Code</p>
                      <p className="mt-2 font-serif text-6xl tracking-[0.18em] text-sand-50">
                        {lineCode}
                      </p>
                      <p className="mt-3 text-xs leading-6 text-sand-300">{T.line.codeNote}</p>
                      {friendUrl && (
                        <a
                          href={friendUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex min-h-11 items-center rounded-full border border-sand-200/50 px-5 text-xs tracking-[0.12em] text-sand-100 hover:bg-sand-100/10"
                        >
                          {T.line.addFriend} →
                        </a>
                      )}
                      <LineLinkWatcher />
                    </div>
                  ) : (
                    <form action={issueLineLinkCode} className="mt-8">
                      <button
                        type="submit"
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-sand-200 px-8 text-sm tracking-[0.12em] text-evergreen-900 transition-colors duration-500 hover:bg-sand-50"
                      >
                        {T.line.issue}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>

          {/* メール */}
          <div className="bg-sand-50 p-8 sm:p-10">
            <Eyebrow>Email</Eyebrow>
            <h3 className="display mt-4 font-mincho text-2xl text-evergreen-900">
              {T.email.title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-ink-500">{T.email.note}</p>
            <form action={requestEmailVerification} className="mt-6">
              <label htmlFor="email" className="field-label">
                {T.email.label}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={T.email.placeholder}
                className="field"
              />
              <button
                type="submit"
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-ink-900/30 px-8 text-sm tracking-[0.12em] text-ink-900 transition-colors duration-500 hover:border-ink-900 hover:bg-ink-900/5"
              >
                {T.email.submit}
              </button>
            </form>
            {emailMessage && (
              <p className="mt-4 text-sm leading-7 text-evergreen-700" role="status">
                {emailMessage}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 頻度と検討段階 */}
      <section className="mt-20" aria-labelledby="cadence">
        {!condition ? (
          <Notice
            title={T.noCondition}
            action={
              <ButtonLink href="/chat" arrow>
                ご相談をはじめる
              </ButtonLink>
            }
          />
        ) : (
          <form action={updateNotificationSettings} className="group/form space-y-16">
            <fieldset>
              <legend id="cadence" className="display font-mincho text-2xl text-evergreen-900">
                {T.frequencyTitle}
              </legend>
              <div className="mt-6 grid gap-px border border-ink-900/15 bg-ink-900/15 sm:grid-cols-3">
                {T.frequencies.map((f) => (
                  <label
                    key={f.v}
                    className="relative cursor-pointer bg-sand-50 p-6 transition-colors duration-500 hover:bg-sand-100 has-[:checked]:bg-evergreen-900 has-[:checked]:text-sand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sand-500 has-[:focus-visible]:ring-inset"
                  >
                    <input
                      type="radio"
                      name="frequency"
                      value={f.v}
                      defaultChecked={condition.frequency === f.v}
                      className="peer sr-only"
                    />
                    <span className="block font-mincho text-xl">{f.label}</span>
                    <span className="mt-2 block text-[13px] leading-6 text-ink-500 peer-checked:text-sand-200">
                      {f.note}
                    </span>
                  </label>
                ))}
              </div>
              {/* すぐに を選んだときは時刻を出さない */}
              <div className="mt-6 flex items-center gap-4 group-has-[input[name=frequency][value=instant]:checked]/form:hidden">
                <label htmlFor="sendHour" className="field-label">
                  {T.sendHour}
                </label>
                <select
                  id="sendHour"
                  name="sendHour"
                  defaultValue={condition.sendHour}
                  className="min-h-11 border-b border-ink-900/25 bg-transparent px-1 font-serif text-xl text-ink-900 focus:border-evergreen-700 focus:outline-none"
                >
                  {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-xs leading-6 text-ink-500 hidden group-has-[input[name=frequency][value=instant]:checked]/form:block">
                夜間（22時〜8時）に見つかった物件は、朝8時にまとめてお届けします。
              </p>
            </fieldset>

            <fieldset>
              <legend className="display font-mincho text-2xl text-evergreen-900">
                {T.phaseTitle}
              </legend>
              <p className="mt-3 text-sm leading-7 text-ink-500">{T.phaseLead}</p>
              <div className="mt-6 grid gap-px border border-ink-900/15 bg-ink-900/15 sm:grid-cols-3">
                {PHASE_ORDER.map((k, i) => {
                  const p = T.phases[k];
                  return (
                    <label
                      key={k}
                      className="cursor-pointer bg-sand-50 p-6 transition-colors duration-500 hover:bg-sand-100 has-[:checked]:bg-evergreen-900 has-[:checked]:text-sand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sand-500 has-[:focus-visible]:ring-inset"
                    >
                      <input
                        type="radio"
                        name="phase"
                        value={k}
                        defaultChecked={condition.phase === k}
                        className="peer sr-only"
                      />
                      {/* ゲージ: 段階が進むほど絞り込む */}
                      <span aria-hidden className="flex h-6 items-end gap-1">
                        {Array.from({ length: 3 }, (_, b) => (
                          <span
                            key={b}
                            className={`w-1.5 bg-current transition-opacity ${b <= i ? "opacity-90" : "opacity-20"}`}
                            style={{ height: `${(b + 1) * 33}%` }}
                          />
                        ))}
                      </span>
                      <span className="mt-4 block font-mincho text-xl">{p.label}</span>
                      <span className="eyebrow mt-1 block text-sand-600 peer-checked:text-sand-300">
                        {p.count}
                      </span>
                      <span className="mt-3 block text-[13px] leading-6 text-ink-500 peer-checked:text-sand-200">
                        {p.note}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-6 border-t border-ink-900/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-900">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={condition.active}
                  className="size-5 accent-evergreen-800"
                />
                {T.active}
              </label>
              <button
                type="submit"
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-evergreen-800 px-10 text-sm tracking-[0.12em] text-sand-50 transition-colors duration-500 hover:bg-evergreen-900"
              >
                {T.save}
              </button>
            </div>
          </form>
        )}
      </section>

      {condition && (
        <section className="mt-20 border-t border-ink-900/15 pt-12" aria-labelledby="brief">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="brief" className="display font-mincho text-2xl text-evergreen-900">
              {T.briefTitle}
            </h2>
            <ButtonLink href="/chat" variant="ghost" arrow>
              {T.briefEdit}
            </ButtonLink>
          </div>
          <div className="mt-6">
            <ConditionSummary condition={condition.condition} />
          </div>
        </section>
      )}
    </PageShell>
  );
}
