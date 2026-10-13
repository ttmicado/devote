import { dealKindLabel, headlinePrice, keyFacts, type NormalizedListing } from "@devote/core";
import Link from "next/link";
import { Fragment } from "react";
import { SELECTIONS } from "@/lib/copy";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** 物件写真。掲載元の画像を直接表示する（ホットリンク対策のサイトがあるため Referer を送らない） */
export function PropertyImage({
  url,
  alt,
  className,
  eager = false,
}: {
  url?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  if (!url) {
    return (
      <div
        className={cx("flex items-center justify-center bg-sand-200/70 text-ink-500", className)}
      >
        <span className="eyebrow">No Photo</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={eager ? "eager" : "lazy"}
      className={cx("bg-sand-200/70 object-cover", className)}
    />
  );
}

/** "45.5万円" → ["45.5", "万円"]。数字は欧文セリフ、単位は明朝で組む */
export function splitAmount(amount: string): [string, string] {
  const m = amount.match(/^(.*?)(万円|億円|円)$/);
  return m ? [m[1] ?? amount, m[2] ?? ""] : [amount, ""];
}

export const dealEyebrow = (l: NormalizedListing) => dealKindLabel(l).en;

/** 大きな総額（賃貸は管理費込みの月額、売買は価格）と内訳の注記 */
export function PriceFigure({
  listing,
  size = "md",
}: {
  listing: NormalizedListing;
  size?: "sm" | "md" | "lg";
}) {
  const h = headlinePrice(listing);
  const [num, unit] = splitAmount(h.amount);
  return (
    <div>
      <p className="text-[11px] tracking-[0.2em] text-ink-500">{h.label}</p>
      <p
        className={cx(
          "display mt-1 flex items-baseline gap-1 text-evergreen-900",
          size === "lg" && "text-6xl sm:text-7xl",
          size === "md" && "text-[2.75rem]",
          size === "sm" && "text-3xl",
        )}
      >
        <span className="font-light tabular-nums lining-nums">{num}</span>
        <span
          className={cx(
            "font-mincho tracking-normal text-ink-700",
            size === "lg" ? "text-xl sm:text-2xl" : "text-base",
          )}
        >
          {unit}
        </span>
      </p>
      {h.note && (
        <p className={cx("mt-1 text-ink-500", size === "lg" ? "text-[13px]" : "text-xs")}>
          {h.note}
        </p>
      )}
    </div>
  );
}

/** "南麻布 · 2LDK 68㎡ · 広尾 徒歩6分 · 築8年 · 12階"。要素の途中では折り返さない */
export function FactsLine({
  listing,
  className,
}: {
  listing: NormalizedListing;
  className?: string;
}) {
  const facts = keyFacts(listing);
  return (
    <p className={cx("leading-7 text-ink-700", className)}>
      {facts.map((f, i) => (
        <Fragment key={f}>
          <span className="whitespace-nowrap">
            {f}
            {i < facts.length - 1 && (
              <span aria-hidden className="px-2 text-sand-500">
                ·
              </span>
            )}
          </span>
          {i < facts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </p>
  );
}

/** ご希望との違い（細い線のマーカー）。違いが無ければ「すべて満たしています」 */
export function DifferenceList({
  reasons,
  max,
  className,
}: {
  reasons: string[];
  max?: number;
  className?: string;
}) {
  const shown = max ? reasons.slice(0, max) : reasons;
  const rest = reasons.length - shown.length;
  const items = reasons.length === 0 ? [SELECTIONS.allMatch] : shown;
  return (
    <ul className={cx("space-y-1.5 text-[13px] leading-6", className)}>
      <li className="sr-only">{SELECTIONS.differences}</li>
      {items.map((r) => (
        <li
          key={r}
          className={cx("flex gap-3", reasons.length === 0 ? "text-evergreen-700" : "text-ink-700")}
        >
          <span aria-hidden className="mt-[0.78rem] h-px w-3 flex-none bg-current opacity-60" />
          <span>{r}</span>
        </li>
      ))}
      {rest > 0 && (
        <li className="pl-6 text-ink-500">
          {SELECTIONS.more} {rest} 点
        </li>
      )}
    </ul>
  );
}

/** ご提案の物件カード。角丸・影を使わず、罫線と余白で組む */
export function PropertyCard({
  id,
  listing,
  score,
  reasons,
}: {
  id: string;
  listing: NormalizedListing;
  score?: number | null;
  reasons?: string[];
}) {
  return (
    <Link href={`/properties/${id}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden bg-sand-200/70">
        <PropertyImage
          url={listing.imageUrls[0]}
          alt={listing.title ?? "物件写真"}
          className="size-full transition-transform duration-[1200ms] ease-[var(--ease-luxe)] group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <span className="eyebrow text-sand-600">{dealEyebrow(listing)}</span>
        {score != null && (
          <span className="text-[11px] tracking-[0.08em] text-ink-500">
            {SELECTIONS.fitLabel}
            <span className="ml-1.5 font-serif text-sm text-ink-700 tabular-nums lining-nums">
              {score}
            </span>
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 font-mincho text-lg leading-snug sm:min-h-[2lh] text-ink-900 transition-colors duration-500 group-hover:text-evergreen-700">
        {listing.title ?? "物件"}
      </h3>
      <div className="mt-4">
        <PriceFigure listing={listing} />
      </div>
      <FactsLine listing={listing} className="mt-4 border-t border-ink-900/15 pt-3 text-[13px]" />
      {reasons !== undefined && <DifferenceList reasons={reasons} max={2} className="mt-2" />}
    </Link>
  );
}

/** 内見のご依頼などで使う、横並びの小さな物件カード */
export function PropertyCompact({ id, listing }: { id: string; listing: NormalizedListing }) {
  return (
    <Link
      href={`/properties/${id}`}
      className="group grid grid-cols-[7.5rem_1fr] gap-5 sm:grid-cols-[11rem_1fr]"
    >
      <div className="aspect-[4/3] overflow-hidden bg-sand-200/70">
        <PropertyImage
          url={listing.imageUrls[0]}
          alt={listing.title ?? "物件写真"}
          className="size-full transition-transform duration-[1200ms] ease-[var(--ease-luxe)] group-hover:scale-[1.03]"
        />
      </div>
      <div className="min-w-0">
        <span className="eyebrow text-sand-600">{dealEyebrow(listing)}</span>
        <h3 className="mt-1 line-clamp-2 font-mincho text-base leading-snug text-ink-900 transition-colors duration-500 group-hover:text-evergreen-700">
          {listing.title ?? "物件"}
        </h3>
        <div className="mt-2">
          <PriceFigure listing={listing} size="sm" />
        </div>
        <FactsLine listing={listing} className="mt-2 hidden text-xs sm:block" />
      </div>
    </Link>
  );
}
