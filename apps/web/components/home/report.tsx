import { ButtonLink } from "@/components/ui";
import { HOME } from "@/lib/copy";
import type { SampleListing } from "./data";
import { LinePhone, toCard } from "./line-phone";
import { Reveal } from "./reveal";
import { Section, SectionHead } from "./section";

const R = HOME.report;
const P = R.phone;

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
          <SectionHead eyebrow={R.eyebrow} title={R.title} body={R.body} tone="dark" index="v." />
          <Reveal delay={120} className="mt-10">
            <ButtonLink href="/chat" tone="dark" variant="outline" arrow>
              {HOME.hero.primary}
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal delay={160} className="flex flex-col items-center lg:items-start lg:pl-6 xl:pl-10">
          <div className="relative" data-phone>
            <LinePhone cards={cards} />
            {cards.length > 0 &&
              R.notes.map((n, i) => (
                <div
                  key={n}
                  className="absolute hidden -translate-y-1/2 items-center xl:flex"
                  style={{ top: MARKER_Y[i], left: MARKER_X }}
                >
                  <span aria-hidden className="h-px w-[110px] bg-sand-300" />
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
