import { HOME } from "@/lib/copy";
import type { SampleListing } from "./data";
import { toCard } from "./line-phone";
import { Reveal } from "./reveal";
import { Section, SectionHead } from "./section";

const R = HOME.report;

/** 番号の印（右の注記と対応） */
function Mark({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-evergreen-800 font-serif text-sm text-sand-50"
    >
      {n}
    </span>
  );
}

/**
 * 届く1件の読み方。見本のスマホはヒーローにあるので、ここでは1件を文字だけで大きく見せ、
 * 各行が何を伝えるかを番号で示す（事実は DB の値のみ）。
 */
export function ReportSection({ samples }: { samples: SampleListing[] }) {
  const card = samples[0] ? toCard(samples[0]) : null;
  return (
    <Section id="report" surface="light">
      <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-24">
        <SectionHead eyebrow={R.eyebrow} title={R.title} body={R.body} index="iii." />
        <Reveal delay={140}>
          {card && (
            <figure className="border border-ink-900/15 bg-sand-100 px-6 py-8 sm:px-10 sm:py-10">
              <figcaption className="field-label">{R.phone.sample}</figcaption>
              <p className="mt-4 font-mincho text-xl text-evergreen-900">{card.title}</p>
              <div className="mt-6 flex items-center gap-4 border-t border-ink-900/15 pt-5">
                <Mark n={1} />
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[12px] text-ink-500">{card.priceLabel}</span>
                  <span className="font-serif text-3xl text-signal lining-nums">{card.amount}</span>
                  {card.priceNote && (
                    <span className="text-[12px] text-ink-500">{card.priceNote}</span>
                  )}
                </p>
              </div>
              <p className="mt-3 pl-10 text-[13px] leading-6 text-ink-700">
                {card.facts.join(" · ")}
              </p>
              <div className="mt-5 flex items-start gap-4 border-t border-ink-900/15 pt-5">
                <Mark n={2} />
                <p className="text-[13px] leading-6 text-ink-700">
                  <span className="text-ink-500">{card.fitLabel}：</span>
                  {card.fit}
                </p>
              </div>
              <div className="mt-5 flex items-center gap-4 border-t border-ink-900/15 pt-5">
                <Mark n={3} />
                {/* 見本なので押せる見た目にはしない */}
                <span className="font-mincho text-[15px] text-evergreen-900">{R.phone.cta}</span>
              </div>
            </figure>
          )}
          <ol className={`border-t border-ink-900/20 ${card ? "mt-8" : ""}`}>
            {R.notes.map((n, i) => (
              <li key={n} className="flex items-center gap-5 border-b border-ink-900/15 py-4">
                <Mark n={i + 1} />
                <span className="text-sm text-ink-700">{n}</span>
              </li>
            ))}
          </ol>
          {card && <p className="mt-5 text-[12px] leading-6 text-ink-500">{R.phone.caption}</p>}
        </Reveal>
      </div>
    </Section>
  );
}
