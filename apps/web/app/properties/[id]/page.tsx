import { FEATURE_DICTIONARY, formatYen, headlinePrice } from "@devote/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { DifferenceList, dealEyebrow, FactsLine, PriceFigure } from "@/components/property-card";
import { ButtonLink, Eyebrow, SpecList } from "@/components/ui";
import { PROPERTY, SELECTIONS } from "@/lib/copy";
import { propertyMatchForUser, propertyWithSources } from "@/lib/data";
import { currentUserId } from "@/lib/session";
import { Gallery } from "./gallery";
import { ClosedPanel, InquiryForm } from "./inquiry-form";

export const dynamic = "force-dynamic";

const featureLabel = (f: string) =>
  FEATURE_DICTIONARY[f]?.label ?? (f === "south_facing" ? "南向き" : f);
const TRANSACTION: Record<string, string> = {
  owner: "貸主・売主",
  agent: "代理",
  exclusive_agency: "専任媒介",
  general_agency: "一般媒介",
  brokerage: "仲介",
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ inquiry?: string }>;
}) {
  const { id } = await params;
  const { inquiry } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const userId = await currentUserId();
  const [p, match] = await Promise.all([
    propertyWithSources(id),
    userId ? propertyMatchForUser(userId, id) : Promise.resolve(null),
  ]);
  if (!p) notFound();
  const l = p.listing;
  const title = l.title ?? "物件";
  const closed = p.status === "closed";
  const isRent = l.dealType === "rent";

  const rows: [string, string | null][] = [
    [isRent ? "賃料" : "価格", formatYen(l.price)],
    ["管理費", l.managementFee ? formatYen(l.managementFee) : null],
    ["修繕積立金", l.repairReserveFee ? formatYen(l.repairReserveFee) : null],
    [
      "敷金／礼金",
      isRent
        ? `${l.deposit != null ? formatYen(l.deposit) : "—"}／${l.keyMoney != null ? formatYen(l.keyMoney) : "—"}`
        : null,
    ],
    ["所在地", l.address.raw],
    ["間取り", l.layout],
    ["専有面積", l.areaSqm != null ? `${l.areaSqm}㎡` : null],
    ["築年月", l.builtYearMonth ? `${l.builtYearMonth.replace("-", "年")}月` : null],
    [
      "階",
      l.floor != null
        ? `${l.floor < 0 ? `地下${-l.floor}` : l.floor}階${l.totalFloors ? `／${l.totalFloors}階建` : ""}`
        : null,
    ],
    ["構造", l.structure],
    ["向き", l.direction],
    ["設備・条件", l.features.map(featureLabel).join("、") || null],
    ["取引態様", TRANSACTION[l.transactionMode] ?? null],
  ];
  const specRows: [string, ReactNode][] = rows.filter(
    (r): r is [string, string] => r[1] != null && r[1] !== "",
  );
  // 交通は路線と駅・徒歩分を途中で折り返さない
  if (l.stations.length > 0) {
    specRows.splice(specRows.findIndex(([k]) => k === "所在地") + 1, 0, [
      "交通",
      <span key="st" className="block whitespace-normal">
        {l.stations.map((s) => (
          <span key={`${s.line}-${s.station}`} className="block">
            {s.line && <span className="mr-2 text-ink-500">{s.line}</span>}
            <span className="whitespace-nowrap">
              {s.station}駅{" "}
              {s.walkMinutes != null
                ? `徒歩${s.walkMinutes}分`
                : s.busMinutes != null
                  ? `バス${s.busMinutes}分`
                  : ""}
            </span>
          </span>
        ))}
      </span>,
    ]);
  }

  const sourceLinks = p.sources
    .filter((s) => s.status === "active" && s.url)
    .map((s) => ({ url: s.url as string, host: hostOf(s.url as string) }))
    .filter((s): s is { url: string; host: string } => s.host != null)
    .filter((s, i, a) => a.findIndex((x) => x.host === s.host) === i);

  const price = headlinePrice(l);

  return (
    <PageShell>
      <Link
        href="/matches"
        className="group inline-flex min-h-11 items-center gap-2 text-xs tracking-[0.12em] text-ink-500 transition-colors duration-500 hover:text-ink-900"
      >
        <span aria-hidden className="transition-transform duration-500 group-hover:-translate-x-1">
          ←
        </span>
        {PROPERTY.back}
      </Link>

      {/* 物件名と総額（数十秒で判断できるよう、写真より先に置く） */}
      <header className="mt-6 grid animate-rise gap-8 border-b border-ink-900/15 pb-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow rule>{[dealEyebrow(l), l.address.city].filter(Boolean).join(" · ")}</Eyebrow>
            {closed && (
              <span className="eyebrow inline-flex min-h-7 items-center rounded-full border border-ink-900/30 px-3 text-ink-700">
                {PROPERTY.closed.badge}
              </span>
            )}
          </div>
          <h1 className="display mt-4 font-mincho text-[2rem] leading-snug text-evergreen-900 sm:text-5xl sm:leading-tight">
            {title}
          </h1>
          <FactsLine listing={l} className="mt-5 text-sm sm:text-[15px]" />
        </div>
        <div className="lg:text-right">
          <PriceFigure listing={l} size="lg" />
        </div>
      </header>

      <div className="mt-8 animate-rise [animation-delay:120ms]">
        <Gallery urls={l.imageUrls} title={title} />
      </div>

      <div className="mt-16 grid gap-16 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-20">
        <div className="min-w-0 space-y-16">
          {match && (
            <section aria-labelledby="diff-title">
              <Eyebrow rule>{PROPERTY.differencesEyebrow}</Eyebrow>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-ink-900/15 pb-4">
                <h2 id="diff-title" className="display font-mincho text-2xl text-evergreen-900">
                  {SELECTIONS.differences}
                </h2>
                <p className="text-xs tracking-[0.08em] text-ink-500">
                  {SELECTIONS.fitLabel}
                  <span className="ml-2 font-serif text-lg text-ink-700 tabular-nums lining-nums">
                    {match.score}
                  </span>
                </p>
              </div>
              <DifferenceList reasons={match.reasons} className="mt-5 text-sm leading-7" />
            </section>
          )}

          <section aria-labelledby="spec-title">
            <Eyebrow rule>{PROPERTY.specEyebrow}</Eyebrow>
            <h2
              id="spec-title"
              className="display mt-4 mb-6 font-mincho text-2xl text-evergreen-900"
            >
              {PROPERTY.specTitle}
            </h2>
            <SpecList rows={specRows} />
            {sourceLinks.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
                {sourceLinks.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 border-b border-transparent transition-colors duration-500 hover:text-ink-900 sm:min-h-0"
                    >
                      {PROPERTY.source}
                      <span className="text-ink-500/80">（{s.host}）</span>
                      <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0">
          {closed ? (
            <ClosedPanel />
          ) : (
            <InquiryForm propertyId={p.id} invalid={inquiry === "invalid"} />
          )}
        </aside>
      </div>

      {/* スマホ: 画面下部に固定の「内見を依頼する」 */}
      {!closed && (
        <>
          <div aria-hidden className="h-20 lg:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-900/15 bg-sand-50/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
              <p className="min-w-0">
                <span className="block text-[10px] tracking-[0.2em] text-ink-500">
                  {price.label}
                </span>
                <span className="display block truncate text-2xl text-evergreen-900">
                  {price.amount}
                </span>
              </p>
              <ButtonLink href="#inquiry" className="flex-none" arrow>
                {PROPERTY.viewing.sticky}
              </ButtonLink>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
