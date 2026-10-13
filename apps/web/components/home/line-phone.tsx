import { formatYen, headlinePrice, keyFacts, type NormalizedListing } from "@devote/core";
import { HOME, SELECTIONS } from "@/lib/copy";
import type { SampleListing } from "./data";
import { type PhoneCard, PhoneCarousel } from "./phone-carousel";

const P = HOME.report.phone;

/** 見本のご希望（吹き出しに書いた条件）。ご希望との違いは実データから計算する */
const SAMPLE_BRIEF = { city: "港区", minArea: 60, maxTotal: 600_000 };

function difference(l: NormalizedListing): string | null {
  const diffs: string[] = [];
  const total = l.price + (l.managementFee ?? 0);
  if (l.address.city && l.address.city !== SAMPLE_BRIEF.city)
    diffs.push(`所在地は${l.address.city}`);
  if (total > SAMPLE_BRIEF.maxTotal)
    diffs.push(`総額がご予算を${formatYen(total - SAMPLE_BRIEF.maxTotal)}上回ります`);
  if (l.areaSqm != null && l.areaSqm < SAMPLE_BRIEF.minArea)
    diffs.push(
      `広さは${l.areaSqm}㎡（ご希望より${(SAMPLE_BRIEF.minArea - l.areaSqm).toFixed(1)}㎡狭い）`,
    );
  return diffs.length ? diffs.join("、") : null;
}

/** 実在の掲載物件を、LINE に届くカードの形にする（事実は DB の値のみ） */
export function toCard({ id, listing: l, photo }: SampleListing): PhoneCard {
  const price = headlinePrice(l);
  const diff = difference(l);
  return {
    id,
    title: l.title ?? "物件",
    image: photo,
    priceLabel: price.label,
    amount: price.amount,
    priceNote: price.note,
    facts: keyFacts(l),
    fitLabel: diff ? SELECTIONS.differences : SELECTIONS.fitLabel,
    fit: diff ?? SELECTIONS.allMatch,
    fitOk: !diff,
  };
}

/**
 * スマホの枠（LINE のトーク画面を模した見本）。
 * screenClassName で画面の高さを変える（レポートの注記は 640px を前提に位置を決めている）。
 */
export function LinePhone({
  cards,
  markers = true,
  className,
  screenClassName = "h-[640px]",
}: {
  cards: PhoneCard[];
  markers?: boolean;
  className?: string;
  screenClassName?: string;
}) {
  return (
    <div
      className={`relative w-[300px] shrink-0 rounded-[46px] border border-sand-100/15 bg-evergreen-950 p-[10px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] sm:w-[320px] ${className ?? ""}`}
    >
      <div className={`relative overflow-hidden rounded-[36px] bg-[#e6ddcc] ${screenClassName}`}>
        {/* ステータスバー＋トークの見出し */}
        <div className="bg-evergreen-900 px-5 pt-3 pb-3 text-sand-100">
          <div className="flex items-center justify-between font-sans text-[10px] tracking-[0.08em] text-sand-300">
            <span>9:41</span>
            <span aria-hidden className="h-[18px] w-20 rounded-full bg-evergreen-950" />
            <span>LTE</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span aria-hidden className="text-sand-300">
              ‹
            </span>
            <span className="font-serif text-lg leading-none font-light">{P.name}</span>
            <span className="ml-auto bg-sand-100/10 px-2 py-0.5 text-[9px] tracking-[0.2em] text-sand-200">
              {P.sample}
            </span>
          </div>
        </div>
        <div className="pt-4">
          <div className="flex items-start gap-2 px-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-evergreen-800 font-serif text-sm text-sand-100"
            >
              D
            </span>
            <div className="rounded-[14px] rounded-tl-sm bg-sand-50 px-3 py-2.5 text-[11px] leading-[1.7] text-ink-900">
              {P.greeting}
              <span className="mt-1.5 block border-t border-ink-900/10 pt-1.5 text-[10px] text-ink-500">
                {P.brief}
              </span>
            </div>
          </div>
          <div className="mt-3">
            {cards.length > 0 ? (
              <PhoneCarousel cards={cards} cta={P.cta} markers={markers} />
            ) : (
              <p className="mx-3 bg-sand-50 px-4 py-10 text-center text-[11px] leading-6 text-ink-500">
                {P.empty}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
