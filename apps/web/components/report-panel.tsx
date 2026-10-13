import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui";
import { SELECTIONS } from "@/lib/copy";
import { formatJst, type userReport } from "@/lib/stats";

type Report = Awaited<ReturnType<typeof userReport>>;

const CHANNEL_LABEL: Record<string, string> = {
  line: "LINE",
  email: "メール",
  instagram: "Instagram",
};
/** 通知の優先順（LINE > メール > Instagram） */
const CHANNEL_ORDER = ["line", "email", "instagram"];

const R = SELECTIONS.report;

/** JST の時（0〜23）と曜日（0=日） */
function jstParts(d: Date) {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return { hour: j.getUTCHours(), day: j.getUTCDay(), date: j };
}

/** 次回のお届けの文言（頻度と時刻から計算する。件数の約束はしない） */
export function nextDeliveryText(frequency: string, sendHour: number, now = new Date()) {
  if (frequency === "instant") return R.instant;
  const { hour, day, date } = jstParts(now);
  const time = `${sendHour}:00`;
  if (frequency === "daily") return `${hour < sendHour ? R.today : R.tomorrow} ${time}`;
  // weekly: 毎週月曜
  let add = (1 - day + 7) % 7;
  if (add === 0 && hour >= sendHour) add = 7;
  if (add === 0) return `${R.today} ${time}`;
  if (add === 1) return `${R.tomorrow}（月）${time}`;
  const next = new Date(date.getTime() + add * 86400_000);
  return `${next.getUTCMonth() + 1}/${next.getUTCDate()}（月）${time}`;
}

function SmallStat({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <div className="min-w-0 border-l border-sand-100/10 pl-3 first:border-l-0 first:pl-0 sm:pl-6 sm:first:border-l sm:first:pl-6">
      <p className="display flex items-baseline gap-1 text-[1.9rem] text-sand-100 sm:text-5xl">
        <span className="font-light tabular-nums lining-nums">{value.toLocaleString("ja-JP")}</span>
        <span className="font-mincho text-xs tracking-normal text-sand-300 sm:text-sm">{unit}</span>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-sand-300 sm:text-xs">{label}</p>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="eyebrow w-28 flex-none text-sand-400">{label}</dt>
      <dd className="text-sm leading-6 text-sand-100">{children}</dd>
    </div>
  );
}

/**
 * ご提案画面の上部「本日のご報告」。数字はすべて userReport の実データ。
 * スマホは一行の帯（本日の新着 · 次回のお届け · 最終確認）にして、詳細は開いて見る。
 */
export function ReportPanel({ report, now = new Date() }: { report: Report; now?: Date }) {
  const { crawl } = report;
  const cond = report.condition;
  const channels: string[] = ("channels" in report && report.channels) || [];
  const channel = CHANNEL_ORDER.find((c) => channels.includes(c));
  const next = !cond
    ? null
    : !cond.active
      ? R.paused
      : channel
        ? nextDeliveryText(cond.frequency, cond.sendHour, now)
        : R.noChannel;
  return (
    <>
      <details className="group/report bg-evergreen-900 text-sand-100 sm:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <span className="sr-only">{SELECTIONS.reportTitle}</span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5 text-[12px] leading-6 text-sand-200">
            <span className="whitespace-nowrap text-sand-100">{R.newShort(crawl.newToday)}</span>
            {next && (
              <span className="whitespace-nowrap">
                {R.next} {next}
              </span>
            )}
            <span className="whitespace-nowrap">
              {crawl.lastCheckedAt
                ? `${R.lastChecked} ${formatJst(crawl.lastCheckedAt)}`
                : R.notYet}
            </span>
          </span>
          <span
            aria-hidden
            className="relative size-3 flex-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-sand-200 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-sand-200 after:transition-transform after:duration-500 group-open/report:after:scale-y-0"
          />
        </summary>
        <div className="border-t border-sand-100/10">
          <ReportBody report={report} now={now} titleId="report-title-m" />
        </div>
      </details>
      <div className="hidden sm:block">
        <ReportBody report={report} now={now} titleId="report-title" />
      </div>
    </>
  );
}

function ReportBody({ report, now, titleId }: { report: Report; now: Date; titleId: string }) {
  const { crawl } = report;
  const cond = report.condition;
  const channels: string[] = ("channels" in report && report.channels) || [];
  const channel = CHANNEL_ORDER.find((c) => channels.includes(c));
  const lastDelivery = ("lastDelivery" in report && report.lastDelivery) || null;
  const matched = ("matchedActive" in report && report.matchedActive) || 0;

  return (
    <section
      aria-labelledby={titleId}
      className="animate-rise bg-evergreen-900 px-6 py-10 text-sand-100 [animation-delay:120ms] sm:px-12 sm:py-12"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <Eyebrow tone="dark" rule>
            {SELECTIONS.reportEyebrow}
          </Eyebrow>
          <h2 id={titleId} className="display mt-3 font-mincho text-2xl text-sand-100">
            {SELECTIONS.reportTitle}
          </h2>
        </div>
        <p className="flex items-center gap-2.5 text-[13px] text-sand-300">
          <span
            aria-hidden
            className={`inline-block size-1.5 rounded-full ${crawl.lastCheckedAt ? "animate-pulse-dot bg-sand-300" : "bg-sand-400/50"}`}
          />
          {crawl.lastCheckedAt ? (
            <>
              {R.lastChecked}
              <span className="font-serif text-base text-sand-100 tabular-nums lining-nums">
                {formatJst(crawl.lastCheckedAt)}
              </span>
            </>
          ) : (
            R.notYet
          )}
        </p>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-14">
        <div>
          <p className="display flex items-baseline gap-2 text-8xl text-sand-50 sm:text-[7.5rem]">
            <span className="font-light tabular-nums lining-nums">
              {matched.toLocaleString("ja-JP")}
            </span>
            <span className="font-mincho text-2xl tracking-normal text-sand-200">件</span>
          </p>
          <p className="mt-3 text-sm text-sand-100">
            {R.matched}
            <span className="ml-2 text-xs text-sand-300">（{R.matchedNote}）</span>
          </p>
        </div>
        <div className="grid grid-cols-3 content-end border-t border-sand-100/10 pt-6 lg:border-t-0 lg:pt-0">
          <SmallStat value={crawl.activeProperties} unit="件" label={R.sources} />
          <SmallStat value={crawl.checkedToday} unit="件" label={R.checked} />
          <SmallStat value={crawl.newToday} unit="件" label={R.newToday} />
        </div>
      </div>

      {crawl.failedSourcesToday > 0 && (
        <p className="mt-8 border-l border-sand-300/60 pl-4 text-[13px] leading-6 text-sand-200">
          {R.delayed}
        </p>
      )}

      {cond && (
        <dl className="mt-10 divide-y divide-sand-100/10 border-t border-sand-100/10">
          <Line label={R.next}>
            {!cond.active ? (
              R.paused
            ) : channel ? (
              <>
                {nextDeliveryText(cond.frequency, cond.sendHour, now)}
                {cond.frequency !== "instant" && (
                  <span className="text-sand-300"> · {CHANNEL_LABEL[channel]}</span>
                )}
                {cond.frequency === "instant" && (
                  <span className="text-sand-300">（{CHANNEL_LABEL[channel]}）</span>
                )}
              </>
            ) : (
              <Link
                href="/settings"
                className="group inline-flex min-h-11 items-center gap-2 border-b border-sand-200/40 text-sand-100 transition-colors duration-500 hover:border-sand-100 sm:min-h-0"
              >
                {R.noChannel}
                <span
                  aria-hidden
                  className="transition-transform duration-500 group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            )}
          </Line>
          <Line label={R.last}>
            {lastDelivery?.at ? (
              <>
                {formatJst(new Date(lastDelivery.at), true)}
                <span className="text-sand-300">
                  {" "}
                  · {lastDelivery.count}件 ·{" "}
                  {CHANNEL_LABEL[lastDelivery.channel] ?? lastDelivery.channel}
                </span>
              </>
            ) : (
              <span className="text-sand-300">{R.noDelivery}</span>
            )}
          </Line>
        </dl>
      )}
    </section>
  );
}
