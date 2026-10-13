import { PropertyImage } from "@/components/property-card";
import { PROPERTY } from "@/lib/copy";

/** 写真のギャラリー。横スクロール（snap）、1枚目を大きく。スマホは1列、PCは2段組み */
export function Gallery({ urls, title }: { urls: string[]; title: string }) {
  if (urls.length === 0) {
    return <PropertyImage alt={title} className="aspect-[16/9] w-full" />;
  }
  if (urls.length === 1) {
    return (
      <div className="aspect-[4/3] overflow-hidden sm:aspect-[16/9]">
        <PropertyImage url={urls[0]} alt={title} eager className="size-full" />
      </div>
    );
  }
  return (
    <figure>
      <div
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto px-5 sm:scroll-px-0 [scrollbar-width:thin] sm:mx-0 sm:grid sm:h-[21rem] sm:auto-cols-[14rem] sm:grid-flow-col sm:grid-rows-2 sm:px-0 sm:pb-3 lg:h-[27rem] lg:auto-cols-[18rem]"
        tabIndex={0}
        aria-label={`${PROPERTY.photos} ${urls.length}`}
      >
        {urls.map((u, i) => (
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
              eager={i < 3}
              className="size-full"
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex items-center justify-between text-xs text-ink-500">
        <span className="eyebrow text-sand-600">{PROPERTY.photos}</span>
        <span className="font-serif text-sm tabular-nums lining-nums">{urls.length}</span>
      </figcaption>
    </figure>
  );
}
