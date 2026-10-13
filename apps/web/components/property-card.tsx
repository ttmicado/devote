import { type NormalizedListing, priceLabel, summarizeListing } from "@devote/core";
import Link from "next/link";

export function PropertyImage({
  url,
  alt,
  className,
}: {
  url?: string;
  alt: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-stone-200 text-stone-400 text-sm ${className ?? ""}`}
      >
        写真なし
      </div>
    );
  }
  // 掲載元サイトの画像を直接表示（ホットリンク対策のサイトがあるため Referer を送らない）
  return (
    <img
      src={url}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={`object-cover ${className ?? ""}`}
    />
  );
}

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
    <Link
      href={`/properties/${id}`}
      className="group block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <PropertyImage
        url={listing.imageUrls[0]}
        alt={listing.title ?? "物件写真"}
        className="h-44 w-full"
      />
      <div className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-bold text-brand-700">
            {listing.dealType === "rent" ? "賃貸" : "売買"}
          </span>
          {score != null && <span className="font-bold text-brand-700">マッチ度 {score}%</span>}
        </div>
        <h3 className="font-bold leading-snug group-hover:text-brand-700">
          {listing.title ?? "物件"}
        </h3>
        <p className="text-lg font-bold text-red-700">{priceLabel(listing)}</p>
        <p className="text-sm text-stone-600">{summarizeListing(listing)}</p>
        {reasons && reasons.length > 0 && (
          <p className="text-xs text-amber-700">⚠ {reasons.join("・")}</p>
        )}
      </div>
    </Link>
  );
}
