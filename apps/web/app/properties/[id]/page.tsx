import { COMPANY, FEATURE_DICTIONARY, formatYen, headlinePrice } from "@devote/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { DifferenceList, dealEyebrow, FactsLine, PriceFigure } from "@/components/property-card";
import { ButtonLink, Eyebrow, Notice, SpecList } from "@/components/ui";
import { PROPERTY, SELECTIONS } from "@/lib/copy";
import {
  inquiryPrefill,
  propertyMatchForUser,
  propertyWithSources,
  userCanSeeProperty,
} from "@/lib/data";
import { estimateMoveInCost, monthsOfRent } from "@/lib/estimate";
import { areaText } from "@/lib/listing-view";
import { currentUserId } from "@/lib/session";
import { formatJst } from "@/lib/stats";
import { EstimatePanel } from "./estimate";
import { Gallery } from "./gallery";
import { ClosedPanel, InquiryForm } from "./inquiry-form";

export const dynamic = "force-dynamic";

const S = PROPERTY.spec;

const featureLabel = (f: string) =>
  FEATURE_DICTIONARY[f]?.label ?? (f === "south_facing" ? "南向き" : f);

/** "2026年10月13日"（JST） */
const dateJst = (d: Date) =>
  d.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** "2026-12" → "2026年12月"。それ以外（"即入居可" "相談" など）は表記どおり */
const availableText = (v: string | null | undefined) => {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}年${Number(m[2])}月` : v;
};

/** 敷金・礼金: 金額と、賃料の何ヶ月分か */
const depositText = (yen: number | null | undefined, rent: number) => {
  if (yen == null) return null;
  if (yen === 0) return S.none;
  const months = monthsOfRent(yen, rent);
  return `${formatYen(yen)}${months ? S.ofRent(months) : ""}`;
};

function BackLink() {
  return (
    <Link
      href="/matches"
      className="group inline-flex min-h-11 items-center gap-2 text-xs tracking-[0.12em] text-ink-500 transition-colors duration-500 hover:text-ink-900"
    >
      <span aria-hidden className="transition-transform duration-500 group-hover:-translate-x-1">
        ←
      </span>
      {PROPERTY.back}
    </Link>
  );
}

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
  const p = await propertyWithSources(id);
  if (!p) notFound();

  // 広告不可・会員サイトだけに載る物件は、ご提案を受けた方にだけ見せる
  const canSee = p.publiclyListable || (userId ? await userCanSeeProperty(userId, id) : false);
  if (!canSee) {
    const M = PROPERTY.membersOnly;
    return (
      <PageShell>
        <BackLink />
        <div className="mt-6">
          <Notice
            title={M.title}
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <ButtonLink href="/chat" arrow>
                  {M.cta}
                </ButtonLink>
                {!userId && (
                  <ButtonLink href={`/login?next=/properties/${id}`} variant="ghost">
                    {M.login}
                  </ButtonLink>
                )}
              </div>
            }
          >
            {M.body}
          </Notice>
        </div>
      </PageShell>
    );
  }

  const [match, prefill] = await Promise.all([
    userId ? propertyMatchForUser(userId, id) : Promise.resolve(null),
    userId ? inquiryPrefill(userId) : Promise.resolve({ name: "", phone: "", email: "" }),
  ]);
  const l = p.listing;
  const title = l.title ?? "物件";
  const closed = p.status === "closed";
  const isRent = l.dealType === "rent";
  const updated = l.sourceUpdatedAt ? new Date(l.sourceUpdatedAt) : p.updatedAt;

  const contract =
    l.contractType === "normal"
      ? S.contractNormal
      : l.contractType === "fixed_term"
        ? S.contractFixed(l.contractTermMonths ?? null)
        : null;

  const rows: [string, string | null | undefined][] = [
    [isRent ? S.rent : S.price, formatYen(l.price)],
    [S.managementFee, l.managementFee ? formatYen(l.managementFee) : null],
    [S.repairReserveFee, l.repairReserveFee ? formatYen(l.repairReserveFee) : null],
    [S.deposit, isRent ? depositText(l.deposit, l.price) : null],
    [S.keyMoney, isRent ? depositText(l.keyMoney, l.price) : null],
    [S.address, l.address.raw],
    [S.layout, l.layout],
    [S.area, areaText(l)],
    [S.built, l.builtYearMonth ? `${l.builtYearMonth.replace("-", "年")}月` : null],
    [
      S.floor,
      l.floor != null
        ? `${l.floor < 0 ? `地下${-l.floor}` : l.floor}階${l.totalFloors ? `／${l.totalFloors}階建` : ""}`
        : null,
    ],
    [S.totalUnits, l.totalUnits ? `${l.totalUnits.toLocaleString("ja-JP")}戸` : null],
    [S.structure, l.structure],
    [S.direction, l.direction],
    [S.availableFrom, availableText(l.availableFrom)],
    [S.contract, isRent ? contract : null],
    [S.renewalFee, isRent ? l.renewalFee : null],
    [S.parking, l.parkingNote],
    [S.features, l.features.map(featureLabel).join("、") || null],
    // 取引態様は常に Devote の立場（掲載元の取引態様は出さない）
    [S.transactionMode, COMPANY.transactionMode],
    [S.updated, dateJst(updated)],
  ];
  const specRows: [string, ReactNode][] = rows.filter(
    (r): r is [string, string] => r[1] != null && r[1] !== "",
  );
  // 交通は路線と駅・徒歩分を途中で折り返さない
  if (l.stations.length > 0) {
    specRows.splice(specRows.findIndex(([k]) => k === S.address) + 1, 0, [
      S.access,
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

  const price = headlinePrice(l);
  const estimate = closed ? null : estimateMoveInCost(l);

  return (
    <PageShell>
      <BackLink />

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
          {p.lastSeenAt && !closed && (
            <p className="mt-3 inline-flex items-center gap-2 text-xs tracking-[0.06em] text-ink-500">
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-evergreen-700" />
              {PROPERTY.lastChecked}
              <span className="font-serif text-sm text-ink-700 tabular-nums lining-nums">
                {formatJst(p.lastSeenAt, true)}
              </span>
            </p>
          )}
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
                {match.score < 100 && (
                  <p className="text-xs tracking-[0.08em] text-ink-500">
                    {SELECTIONS.fitLabel}
                    <span className="ml-2 font-serif text-lg text-ink-700 tabular-nums lining-nums">
                      {match.score}
                    </span>
                  </p>
                )}
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
          </section>

          {estimate && <EstimatePanel estimate={estimate} />}
        </div>

        <aside className="min-w-0">
          {closed ? (
            <ClosedPanel />
          ) : (
            <InquiryForm
              propertyId={p.id}
              isRent={isRent}
              prefill={prefill}
              error={
                inquiry === "invalid" ? "invalid" : inquiry === "ratelimited" ? "ratelimited" : null
              }
            />
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
