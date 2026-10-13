"use client";

import { useRef, useState } from "react";

export type PhoneCard = {
  id: string;
  title: string;
  image: string | null;
  priceLabel: string;
  amount: string;
  priceNote: string | null;
  facts: string[];
  fitLabel: string;
  fit: string;
  fitOk: boolean;
};

/** 番号の印（注記の吹き出しと対応） */
function Marker({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      data-marker={n}
      className="absolute top-1/2 -right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-evergreen-800 font-serif text-[11px] text-sand-50 ring-2 ring-sand-50"
    >
      {n}
    </span>
  );
}

/** スマホ枠の中のカルーセル（スクロールスナップ＋位置の点） */
export function PhoneCarousel({ cards, cta }: { cards: PhoneCard[]; cta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    setActive(Math.round(el.scrollLeft / (first.offsetWidth + 10)));
  };

  return (
    <div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => (
          <article
            key={c.id}
            className="w-[82%] shrink-0 snap-start overflow-hidden bg-sand-50 text-ink-900"
          >
            <div className="relative aspect-[16/10] bg-sand-200">
              {c.image && (
                <img
                  src={c.image}
                  alt={c.title}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="size-full object-cover"
                />
              )}
              <span className="absolute top-2 left-2 bg-evergreen-900/85 px-2 py-0.5 font-sans text-[9px] tracking-[0.2em] text-sand-100 uppercase">
                No. {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="px-3.5 pt-3 pb-3.5">
              <p className="h-5 truncate font-mincho text-[13px] text-evergreen-900">{c.title}</p>
              <div className="relative mt-2 flex h-6 items-baseline gap-2">
                <span className="text-[9px] tracking-[0.12em] text-ink-500">{c.priceLabel}</span>
                <span className="font-serif text-[22px] leading-none text-signal lining-nums">
                  {c.amount}
                </span>
                {i === 0 && <Marker n={1} />}
              </div>
              <p className="mt-1 h-4 truncate text-[9.5px] text-ink-500">{c.priceNote}</p>
              <p className="mt-2 line-clamp-2 h-[34px] text-[10.5px] leading-[17px] text-ink-700">
                {c.facts.join(" · ")}
              </p>
              <div className="relative mt-2.5 border-t border-ink-900/10 pt-2">
                <p className="h-4 text-[9px] tracking-[0.12em] text-ink-500">{c.fitLabel}</p>
                <p
                  className={`line-clamp-2 h-8 pr-4 text-[10.5px] leading-4 ${c.fitOk ? "text-evergreen-700" : "text-ink-900"}`}
                >
                  {c.fit}
                </p>
                {i === 0 && <Marker n={2} />}
              </div>
              <div className="relative mt-3">
                <span className="flex h-9 items-center justify-center rounded-full bg-evergreen-800 text-[11px] tracking-[0.12em] text-sand-50">
                  {cta}
                </span>
                {i === 0 && <Marker n={3} />}
              </div>
            </div>
          </article>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {cards.map((c, i) => (
            <span
              key={c.id}
              className={`h-[3px] rounded-full transition-all duration-500 ${i === active ? "w-5 bg-evergreen-800" : "w-[3px] bg-ink-900/25"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
