import { formatYen } from "@devote/core";
import { Eyebrow } from "@/components/ui";
import { PROPERTY } from "@/lib/copy";
import type { MoveInEstimate } from "@/lib/estimate";

const E = PROPERTY.estimate;

/**
 * 初期費用の概算（目安）。掲載されている金額だけから計算し、事実の一覧（物件の仕様）とは
 * 面を分けて「目安」であることが分かるようにする。
 */
export function EstimatePanel({ estimate }: { estimate: MoveInEstimate }) {
  const rows: [string, string | null, string | null][] = [
    [E.deposit, estimate.deposit == null ? null : formatYen(estimate.deposit), null],
    [E.keyMoney, estimate.keyMoney == null ? null : formatYen(estimate.keyMoney), null],
    [E.brokerage, formatYen(estimate.brokerage), E.brokerageNote],
    [E.advanceRent, formatYen(estimate.advanceRent), E.advanceRentNote],
  ];
  return (
    <section
      aria-labelledby="estimate-title"
      className="border border-dashed border-ink-900/25 px-5 py-8 sm:px-8"
    >
      <Eyebrow rule>{E.eyebrow}</Eyebrow>
      <h2 id="estimate-title" className="display mt-4 font-mincho text-2xl text-evergreen-900">
        {E.title}
      </h2>
      <p className="mt-3 text-[13px] leading-6 text-ink-500">{E.lead}</p>
      <dl className="mt-6 divide-y divide-ink-900/10 border-y border-ink-900/15 text-sm">
        {rows.map(([k, v, note]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 text-ink-700">
              {k}
              {note && <span className="mt-0.5 block text-xs text-ink-500">{note}</span>}
            </dt>
            <dd
              className={
                v == null
                  ? "flex-none text-[13px] text-ink-500"
                  : "flex-none font-serif text-lg text-ink-900 tabular-nums lining-nums"
              }
            >
              {v ?? E.unknown}
            </dd>
          </div>
        ))}
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <dt className="min-w-0 text-ink-700">{E.others}</dt>
          <dd className="text-[13px] leading-6 text-ink-500 sm:max-w-[55%] sm:text-right">
            {E.othersValue}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <p className="text-sm text-ink-900">
          {E.total}
          <span className="mt-0.5 block text-xs leading-5 text-ink-500">
            {estimate.complete ? E.totalNote : E.totalPartial}
          </span>
        </p>
        <p className="display flex-none text-3xl text-evergreen-900 tabular-nums lining-nums">
          {formatYen(estimate.total)}
        </p>
      </div>
    </section>
  );
}
