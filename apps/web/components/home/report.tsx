import { formatYen, headlinePrice, keyFacts, type NormalizedListing } from "@devote/core";
import { ButtonLink } from "@/components/ui";
import { HOME, SELECTIONS } from "@/lib/copy";
import type { SampleListing } from "./data";
import { type PhoneCard, PhoneCarousel } from "./phone-carousel";
import { Reveal } from "./reveal";
import { Section, SectionHead } from "./section";

const R = HOME.report;
const P = R.phone;

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

function toCard({ id, listing: l, photo }: SampleListing): PhoneCard {
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

/** スマホの枠（LINE のトーク画面を模した見本） */
function Phone({ cards }: { cards: PhoneCard[] }) {
  return (
    <div className="relative w-[300px] shrink-0 rounded-[46px] border border-sand-100/15 bg-evergreen-950 p-[10px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] sm:w-[320px]">
      <div className="relative h-[640px] overflow-hidden rounded-[36px] bg-[#e6ddcc]">
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
              <PhoneCarousel cards={cards} cta={P.cta} />
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

/**
 * 吹き出し（デスクトップ: 見本カードの番号の印から線を引く／モバイル: 電話の下に番号付きで並べる）。
 * カードの各行は高さを固定しているので、印の位置は一定（電話の枠の左上からの px）。
 */
const MARKER_Y = [414, 527, 585];
const MARKER_X = 230;

function NoteList({ className }: { className?: string }) {
  return (
    <ol className={`w-full max-w-[400px] border-t border-sand-100/10 ${className ?? ""}`}>
      {R.notes.map((n, i) => (
        <li key={n} className="flex items-center gap-5 border-b border-sand-100/10 py-4">
          <span className="flex size-6 items-center justify-center rounded-full bg-sand-200 font-serif text-sm text-evergreen-900">
            {i + 1}
          </span>
          <span className="text-sm text-sand-100">{n}</span>
        </li>
      ))}
    </ol>
  );
}

export function ReportSection({ samples }: { samples: SampleListing[] }) {
  const cards = samples.map(toCard);
  return (
    <Section
      id="report"
      surface="dark"
      art={
        <div
          aria-hidden
          className="absolute top-1/2 right-[8%] size-[720px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(47,101,78,0.5),transparent_65%)]"
        />
      }
    >
      <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10">
        <div>
          <SectionHead eyebrow={R.eyebrow} title={R.title} body={R.body} tone="dark" />
          <Reveal delay={120} className="mt-10">
            <ButtonLink href="/chat" tone="dark" variant="outline" arrow>
              {HOME.hero.primary}
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal delay={160} className="flex flex-col items-center lg:items-start lg:pl-6 xl:pl-10">
          <div className="relative" data-phone>
            <Phone cards={cards} />
            {cards.length > 0 &&
              R.notes.map((n, i) => (
                <div
                  key={n}
                  className="absolute hidden -translate-y-1/2 items-center xl:flex"
                  style={{ top: MARKER_Y[i], left: MARKER_X }}
                >
                  <span aria-hidden className="h-px w-[150px] bg-sand-300" />
                  <span className="flex items-center gap-3 rounded-full border border-sand-200/30 bg-evergreen-900/90 py-2 pr-5 pl-2 text-[13px] whitespace-nowrap text-sand-100 backdrop-blur-sm">
                    <span className="flex size-6 items-center justify-center rounded-full bg-sand-200 font-serif text-sm text-evergreen-900">
                      {i + 1}
                    </span>
                    {n}
                  </span>
                </div>
              ))}
          </div>
          {cards.length > 0 && (
            <>
              <NoteList className="mt-10 xl:hidden" />
              <p className="mt-6 text-[12px] leading-6 text-sand-300">{P.caption}</p>
            </>
          )}
        </Reveal>
      </div>
    </Section>
  );
}
