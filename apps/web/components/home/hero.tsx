import { ButtonLink, Eyebrow } from "@/components/ui";
import { HOME } from "@/lib/copy";
import { formatJst } from "@/lib/stats";
import type { CrawlSummary, SampleListing } from "./data";
import { Contours, Facade, FloorPlan, Skyline } from "./line-art";
import { LinePhone, toCard } from "./line-phone";
import type { PhoneCard } from "./phone-carousel";
import { Phrase } from "./section";

const H = HOME.hero;
const L = HOME.live;

/** 右側に傾けて並べる線画のパネル（springs.estate の写真モザイクを線画で） */
function Mosaic() {
  const panel =
    "relative overflow-hidden border border-sand-100/10 bg-gradient-to-b from-evergreen-800/60 to-evergreen-900/20";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-[-18%] right-[-22%] opacity-50 sm:opacity-100 h-[140%] w-[95%] rotate-[-14deg] [mask-image:linear-gradient(105deg,transparent_10%,black_45%,black_70%,transparent_95%)] sm:right-[-12%] lg:w-[64%]"
    >
      <div className="grid h-full grid-cols-3 gap-4 lg:gap-6">
        <div className="flex translate-y-[8%] flex-col gap-4 lg:gap-6">
          <div className={`${panel} h-[34%]`}>
            <Contours className="absolute inset-0 size-full text-sand-200/15" rings={10} />
          </div>
          <div className={`${panel} h-[46%]`}>
            <Facade className="absolute inset-0 size-full p-6 text-sand-200/15" />
          </div>
        </div>
        <div className="flex -translate-y-[4%] flex-col gap-4 lg:gap-6">
          <div className={`${panel} h-[48%]`}>
            <Skyline className="absolute inset-x-0 bottom-0 h-3/4 w-full text-sand-200/20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(227,212,185,0.16),transparent_55%)]" />
          </div>
          <div className={`${panel} h-[30%]`}>
            <FloorPlan className="absolute inset-0 m-auto w-3/4 text-sand-200/15" />
          </div>
        </div>
        <div className="flex translate-y-[14%] flex-col gap-4 lg:gap-6">
          <div className={`${panel} h-[28%]`}>
            <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(185,162,124,0.18),transparent_60%)]" />
          </div>
          <div className={`${panel} h-[44%]`}>
            <Contours className="absolute inset-0 size-full text-sand-200/10" rings={16} />
          </div>
        </div>
      </div>
    </div>
  );
}

const nf = (n: number) => n.toLocaleString("ja-JP");

function LiveBand({ crawl }: { crawl: CrawlSummary | null }) {
  const live = crawl && (crawl.activeProperties > 0 || crawl.checkedToday > 0);
  const items = live
    ? [
        { value: nf(crawl.checkedToday), unit: "件", label: L.checked },
        { value: nf(crawl.newToday), unit: "件", label: L.newToday },
        { value: nf(crawl.activeProperties), unit: "件", label: L.active },
      ]
    : L.fallback.map((f) => ({ ...f }));
  return (
    <div className="border-t border-sand-100/10">
      <div className="mx-auto grid max-w-[1440px] gap-y-8 px-5 py-8 sm:px-10 lg:grid-cols-[1.1fr_3fr] lg:gap-x-12 lg:px-16 lg:py-7">
        <div className="flex items-start gap-3 lg:flex-col lg:gap-4">
          <p className="eyebrow flex items-center gap-3 text-sand-300">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-pulse-dot rounded-full bg-sand-300" />
            </span>
            {L.eyebrow}
          </p>
          <p className="ml-auto text-[12px] tracking-[0.08em] text-sand-300 lg:ml-0">
            {live && crawl?.lastCheckedAt ? (
              <>
                {L.last}
                <span className="ml-2 font-serif text-lg tracking-normal text-sand-100">
                  {formatJst(crawl.lastCheckedAt)}
                </span>
              </>
            ) : (
              L.pending
            )}
          </p>
        </div>
        <dl
          className={`grid grid-cols-2 gap-x-6 gap-y-7 ${items.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
        >
          {items.map((s) => (
            <div key={s.label} className="flex flex-col border-l border-sand-100/10 pl-4 sm:pl-6">
              <dt className="order-2 mt-3 text-[12px] leading-5 text-sand-300">{s.label}</dt>
              <dd className="order-1 flex items-baseline gap-1 font-serif text-[2.4rem] leading-none font-light text-sand-100 lining-nums tabular-nums sm:text-5xl">
                {s.value}
                <span className="font-mincho text-sm text-sand-200">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** ヒーローの右側（モバイルは見出しの下）: 実際に届く LINE の見本 */
function DeliveredSample({ cards }: { cards: PhoneCard[] }) {
  const D = H.delivered;
  return (
    <div className="relative flex justify-center lg:justify-end">
      {/* 注記: 出たら、届く（デスクトップでは電話の左に罫線でつなぐ） */}
      <div className="absolute top-[132px] right-full hidden w-[250px] xl:block">
        <div className="flex items-center gap-3">
          <Eyebrow tone="dark">{D.en}</Eyebrow>
          <span aria-hidden className="h-px flex-1 bg-sand-300/50" />
          <span aria-hidden className="mr-[-3px] size-1.5 rounded-full bg-sand-200" />
        </div>
        <p className="mt-4 font-mincho text-2xl text-sand-100">{D.title}</p>
        <p className="mt-3 pr-10 text-[13px] leading-6 text-sand-100/80">
          <Phrase text={D.body} />
        </p>
      </div>
      {/* 電話の下端は背景に溶かす（見本の続きがあることを示す） */}
      <div className="relative [mask-image:linear-gradient(to_bottom,black_78%,transparent)] lg:[mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
        <LinePhone
          cards={cards}
          markers={false}
          className="w-[268px] sm:w-[290px]"
          screenClassName="h-[460px] sm:h-[520px] lg:h-[560px]"
        />
      </div>
    </div>
  );
}

export function Hero({ crawl, samples }: { crawl: CrawlSummary | null; samples: SampleListing[] }) {
  const cards = samples.map(toCard);
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-evergreen-950 text-sand-100">
      {/* 背景: 深緑のグラデーション＋ゆっくり動く光 */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(160deg,#0d1a15_0%,#142821_40%,#1b3a2e_75%,#24503d_100%)]"
      />
      <div
        aria-hidden
        className="absolute top-[-30%] right-[-20%] -z-10 size-[110vw] animate-drift rounded-full bg-[radial-gradient(circle,rgba(47,101,78,0.55),transparent_60%)] lg:size-[70vw]"
      />
      <div
        aria-hidden
        className="absolute bottom-[-35%] left-[-25%] -z-10 size-[100vw] animate-drift rounded-full bg-[radial-gradient(circle,rgba(207,188,152,0.11),transparent_62%)] lg:size-[60vw]"
        style={{ animationDuration: "26s", animationDirection: "reverse" }}
      />
      <div className="absolute inset-0 -z-10 opacity-35">
        <Mosaic />
      </div>
      <Skyline className="pointer-events-none absolute right-0 bottom-[150px] -z-10 h-[30vh] w-full text-sand-200/[0.05] lg:bottom-[120px] lg:w-[60%]" />

      {/* モバイル: 見出し → 見本 → 価値・CTA ／ デスクトップ: 左に見出し・価値・CTA、右に見本 */}
      <div className="relative mx-auto grid w-full max-w-[1440px] flex-1 content-center gap-x-16 px-5 pt-[calc(76px+2.5rem)] pb-14 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] lg:px-16 lg:pt-[calc(76px+0.75rem)] lg:pb-8 xl:gap-x-28">
        <div className="lg:self-end">
          <p className="eyebrow flex animate-rise items-center gap-3 text-sand-300">
            <span aria-hidden className="inline-block h-px w-8 bg-current" />
            {H.eyebrow}
          </p>
          <h1 className="display mt-6 font-mincho text-[clamp(2.75rem,11vw,5.75rem)] leading-[1.08] font-normal text-sand-100 lg:mt-6">
            <span className="block animate-rise" style={{ animationDelay: "100ms" }}>
              {H.title[0]}
            </span>
            <span className="block animate-rise lg:pl-[1em]" style={{ animationDelay: "220ms" }}>
              {H.title[1]}
            </span>
          </h1>
          <p
            className="mt-7 max-w-[34em] animate-rise text-[15px] leading-8 [word-break:auto-phrase] text-sand-100/90 sm:text-base sm:leading-8 lg:mt-7"
            style={{ animationDelay: "320ms" }}
          >
            <Phrase text={H.lead} />
          </p>
        </div>
        <div
          className="mt-10 animate-rise lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center"
          style={{ animationDelay: "380ms" }}
        >
          <DeliveredSample cards={cards} />
        </div>
        <div className="lg:self-start">
          <ol
            className="mt-8 grid animate-rise border-t border-sand-100/15 sm:grid-cols-3 lg:mt-7"
            style={{ animationDelay: "420ms" }}
          >
            {H.values.map((v) => (
              <li
                key={v.no}
                className="flex items-baseline gap-4 border-b border-sand-100/10 py-3.5 sm:block sm:border-b-0 sm:py-5 sm:pr-6 sm:[&+li]:border-l sm:[&+li]:border-sand-100/15 sm:[&+li]:pl-6"
              >
                <span className="font-serif text-sm text-sand-300 italic">{v.no}</span>
                <span className="block font-mincho text-[17px] text-sand-100 sm:mt-2 sm:text-lg">
                  {v.title}
                </span>
                <span className="mt-1 hidden text-[12px] leading-5 text-sand-300 sm:block">
                  {v.note}
                </span>
              </li>
            ))}
          </ol>
          <div
            className="mt-9 flex animate-rise flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 lg:mt-8"
            style={{ animationDelay: "520ms" }}
          >
            <ButtonLink href="/chat" tone="dark" size="lg" arrow>
              {H.primary}
            </ButtonLink>
            <ButtonLink href="#report" tone="dark" variant="outline" size="lg">
              {H.secondary}
            </ButtonLink>
          </div>
          <p
            className="mt-5 animate-rise text-[12px] leading-6 text-sand-300 lg:mt-4"
            style={{ animationDelay: "600ms" }}
          >
            <Phrase text={H.scope} />
          </p>
        </div>
      </div>

      <LiveBand crawl={crawl} />
    </section>
  );
}
