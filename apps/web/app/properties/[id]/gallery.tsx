import { PropertyImage } from "@/components/property-card";
import { PROPERTY } from "@/lib/copy";

/** 横並びに出す写真の上限（それ以上は「すべての写真」で開く） */
const STRIP_MAX = 12;

/**
 * 写真のギャラリー。横スクロール（snap）、1枚目を大きく。スマホは1列、PCは2段組み。
 * 1枚目だけ先に読み込み（LCP）、残りは遅延読み込み。13枚目以降は折りたたむ。
 */
export function Gallery({ urls, title }: { urls: string[]; title: string }) {
  if (urls.length === 0) {
    return <PropertyImage alt={title} className="aspect-[16/9] w-full" />;
  }
  if (urls.length === 1) {
    return (
      <div className="aspect-[4/3] overflow-hidden sm:aspect-[16/9]">
        <PropertyImage url={urls[0]} alt={title} priority className="size-full" />
      </div>
    );
  }
  const strip = urls.slice(0, STRIP_MAX);
  const rest = urls.slice(STRIP_MAX);
  return (
    <figure>
      <div
        role="region"
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto px-5 sm:scroll-px-0 [scrollbar-width:thin] sm:mx-0 sm:grid sm:h-[21rem] sm:auto-cols-[14rem] sm:grid-flow-col sm:grid-rows-2 sm:px-0 sm:pb-3 lg:h-[27rem] lg:auto-cols-[18rem]"
        tabIndex={0}
        aria-label={`${PROPERTY.photos} ${urls.length}`}
      >
        {strip.map((u, i) => (
          <div
            key={u}
            className={
              i === 0
                ? "aspect-[4/3] w-[86%] flex-none snap-start overflow-hidden sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:w-auto"
                : "aspect-[4/3] w-[86%] flex-none snap-start overflow-hidden sm:aspect-auto sm:w-auto"
            }
          >
            <PropertyImage
              url={u}
              alt={`${title}（${i + 1}/${urls.length}）`}
              priority={i === 0}
              className="size-full"
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex items-center justify-between text-xs text-ink-500">
        <span className="eyebrow text-sand-600">{PROPERTY.photos}</span>
        <span className="font-serif text-sm tabular-nums lining-nums">{urls.length}</span>
      </figcaption>
      {rest.length > 0 && (
        <details className="group/photos mt-2 border-t border-ink-900/15">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-[13px] tracking-[0.06em] text-ink-700 [&::-webkit-details-marker]:hidden">
            <span className="group-open/photos:hidden">{PROPERTY.photosAll(urls.length)}</span>
            <span className="hidden group-open/photos:inline">{PROPERTY.photosLess}</span>
            <span
              aria-hidden
              className="relative size-3 flex-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-ink-700 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-ink-700 after:transition-transform after:duration-500 group-open/photos:after:scale-y-0"
            />
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-2 pb-4 sm:grid-cols-3 lg:grid-cols-4">
            {rest.map((u, i) => (
              <div key={u} className="aspect-[4/3] overflow-hidden">
                <PropertyImage
                  url={u}
                  alt={`${title}（${STRIP_MAX + i + 1}/${urls.length}）`}
                  className="size-full"
                />
              </div>
            ))}
          </div>
        </details>
      )}
    </figure>
  );
}
