import Link from "next/link";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { AREAS, BRAND, HOME, PREFERENCES } from "@/lib/copy";
import { Contours } from "./line-art";
import { Reveal } from "./reveal";
import { Phrase, Section, SectionHead } from "./section";

/* ───────── ご利用の流れ＋情報源 ───────── */

export function FlowSection() {
  const F = HOME.flow;
  const S = F.sources;
  return (
    <Section id="flow" surface="light">
      <SectionHead eyebrow={F.eyebrow} title={F.title} index="i." className="max-w-3xl" />
      <ol className="mt-16 grid gap-0 sm:mt-20 md:grid-cols-3 md:gap-10 lg:gap-16">
        {F.steps.map((s, i) => (
          <li key={s.no} className="relative border-t border-ink-900/20">
            <Reveal delay={i * 120} className="pt-8 pb-12 md:pb-0">
              <span aria-hidden className="absolute -top-px left-0 h-px w-16 bg-evergreen-800" />
              <p className="font-serif text-[4.5rem] leading-none font-light text-evergreen-900 lining-nums tabular-nums lg:text-[6rem]">
                {s.no}
              </p>
              <h3 className="mt-6 font-mincho text-2xl text-evergreen-900">{s.title}</h3>
              <p className="mt-4 max-w-[24em] text-[15px] leading-8 text-ink-700">{s.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>

      {/* 情報源: 手順の「どこを見ているか」を続けて示す */}
      <div className="mt-24 grid gap-12 border-t border-ink-900/15 pt-16 lg:mt-32 lg:grid-cols-[1fr_1.3fr] lg:gap-24 lg:pt-24">
        <Reveal>
          <Eyebrow rule lang="en">
            {S.eyebrow}
          </Eyebrow>
          <h3 className="display mt-6 font-mincho text-[1.7rem] text-evergreen-900 [word-break:auto-phrase] sm:text-[2.2rem]">
            <Phrase text={S.title} />
          </h3>
          <p className="mt-6 max-w-[34em] text-[15px] leading-8 text-ink-700">{S.body}</p>
        </Reveal>
        <div>
          <ul className="border-t border-ink-900/25">
            {S.groups.map((g, gi) => (
              <li key={g.en} className="border-b border-ink-900/15">
                <Reveal
                  delay={gi * 120}
                  className="grid gap-3 py-7 sm:grid-cols-[3rem_1fr] sm:gap-6"
                >
                  <span className="font-serif text-sm text-ink-500 italic tabular-nums">
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <Eyebrow lang="en">{g.en}</Eyebrow>
                    <p className="mt-2 font-mincho text-xl text-evergreen-900">{g.ja}</p>
                    <p className="mt-3 text-[14px] leading-7 text-ink-500">{g.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <p className="field-label">{S.areasLabel}</p>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {AREAS.map((a) => (
                <li key={a.en} className="font-mincho text-[15px] text-evergreen-900">
                  {a.ja}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[12px] text-ink-500">{S.note}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ───────── ご自身で探す場合との比較 ───────── */

export function CompareSection() {
  const C = HOME.compare;
  return (
    <Section surface="paper">
      <SectionHead eyebrow={C.eyebrow} title={C.title} index="ii." size="xl" />
      <Reveal delay={120} className="mt-16 lg:mt-24">
        {/* モバイルの凡例（デスクトップは表の見出し） */}
        <p aria-hidden className="mb-8 flex flex-col gap-1 md:hidden">
          <span className="text-[13px] text-ink-500">{C.self}</span>
          <span className="font-mincho text-base text-evergreen-900">→ {C.devote}</span>
        </p>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            {C.self} / {C.devote}
          </caption>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-ink-900/25">
              <th scope="col" className="w-[9rem] pb-5 lg:w-[12rem]">
                <span className="sr-only">項目</span>
              </th>
              <th scope="col" className="pb-5 pr-10 font-normal">
                <span lang="en" className="eyebrow text-ink-500">
                  Yourself
                </span>
                <span className="mt-2 block font-mincho text-base text-ink-700">{C.self}</span>
              </th>
              <th
                scope="col"
                className="relative w-[48%] border-l border-ink-900/15 pb-5 pl-10 font-normal"
              >
                <span
                  aria-hidden
                  className="absolute -bottom-px left-0 h-px w-24 bg-evergreen-800"
                />
                <span lang="en" className="eyebrow text-sand-600">
                  With Devote
                </span>
                <span className="mt-2 block font-mincho text-base text-evergreen-900">
                  {C.devote}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {C.rows.map((r, i) => (
              <tr
                key={r.en}
                className="grid border-b border-ink-900/15 py-7 first:border-t first:border-ink-900/25 md:table-row md:py-0 md:first:border-t-0"
              >
                <th
                  scope="row"
                  className="flex items-baseline gap-3 font-normal md:table-cell md:py-9 md:align-baseline"
                >
                  <span className="font-serif text-sm text-sand-600 italic tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span lang="en" className="eyebrow text-ink-500 md:mt-2 md:block">
                    {r.en}
                  </span>
                </th>
                <td className="mt-4 text-[14px] leading-7 text-ink-500 md:table-cell md:py-9 md:pr-10 md:align-baseline md:text-[15px]">
                  {r.self}
                </td>
                <td className="mt-3 md:table-cell md:border-l md:border-ink-900/15 md:py-9 md:pl-10 md:align-baseline">
                  <span className="flex items-baseline gap-3">
                    <span aria-hidden className="text-evergreen-800 md:hidden">
                      →
                    </span>
                    <span className="font-mincho text-[19px] leading-8 text-evergreen-900 [word-break:auto-phrase] sm:text-[1.5rem] sm:leading-9">
                      <Phrase text={r.devote} />
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
      <Reveal delay={160} className="mt-14 flex justify-start">
        <ButtonLink href="/chat" arrow>
          {HOME.hero.primary}
        </ButtonLink>
      </Reveal>
    </Section>
  );
}

/* ───────── 3つの約束＋検討段階に合わせた厳選 ───────── */

const PHASES = (["exploring", "considering", "ready"] as const).map((k) => {
  const p = PREFERENCES.phases[k];
  const m = p.count.match(/^(最大)?(.+?)件$/);
  return {
    key: k,
    ...p,
    prefix: m?.[1] ?? "",
    value: m?.[2] ?? p.count,
    filled: k === "exploring" ? 20 : k === "considering" ? 8 : 3,
  };
});

export function PromiseSection() {
  const P = HOME.promise;
  const C = HOME.curation;
  return (
    <Section surface="dark">
      <SectionHead eyebrow={P.eyebrow} title={P.title} tone="dark" index="iv." size="xl" />
      <ol className="mt-16 grid border-t border-sand-100/15 lg:mt-24 lg:grid-cols-3">
        {P.items.map((it, i) => (
          <li
            key={it.no}
            className="border-b border-sand-100/10 py-10 lg:border-b-0 lg:py-14 lg:pr-10 lg:[&+li]:border-l lg:[&+li]:border-sand-100/10 lg:[&+li]:pl-10"
          >
            <Reveal delay={i * 100}>
              <div className="flex items-baseline gap-5">
                <span className="font-serif text-5xl leading-none font-light text-sand-300">
                  {it.no}
                </span>
                <span>
                  <Eyebrow tone="dark" lang="en">
                    {it.en}
                  </Eyebrow>
                  <span className="mt-1 block font-mincho text-[15px] text-sand-200">{it.ja}</span>
                </span>
              </div>
              <h3 className="display mt-8 font-mincho text-2xl text-sand-100 [word-break:auto-phrase] sm:text-[1.75rem]">
                <Phrase text={it.title} />
              </h3>
              <p className="mt-5 max-w-[30em] text-[15px] leading-8 text-sand-100/85">{it.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>

      {/* 必要な数だけ: 検討段階ごとの1日の上限 */}
      <div className="mt-24 grid gap-10 lg:mt-32 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-24">
        <Reveal>
          <Eyebrow tone="dark" rule lang="en">
            {C.eyebrow}
          </Eyebrow>
          <h3 className="display mt-6 font-mincho text-[1.7rem] text-sand-100 [word-break:auto-phrase] sm:text-[2.2rem]">
            <Phrase text={C.title} />
          </h3>
        </Reveal>
        <Reveal delay={120}>
          <p className="max-w-[34em] text-[15px] leading-8 text-sand-100/85">{C.body}</p>
        </Reveal>
      </div>
      <ul className="mt-12 grid gap-px bg-sand-100/10 md:mt-16 md:grid-cols-3">
        {PHASES.map((p, i) => (
          <li key={p.key} className="h-full">
            <Reveal
              delay={i * 120}
              className={`flex h-full flex-col p-7 sm:p-10 ${p.key === "ready" ? "bg-evergreen-800" : "bg-evergreen-950"}`}
            >
              <div className="flex items-center justify-between">
                <span lang="en" className="eyebrow text-sand-300">
                  Phase {i + 1}
                </span>
                <span className="font-mincho text-[15px] text-sand-100">{p.label}</span>
              </div>
              {/* ゲージ: 1回のお届けの最大件数を20本の線で示す */}
              <div className="mt-10 flex h-16 items-end gap-[5px]" aria-hidden>
                {Array.from({ length: 20 }, (_, k) => (
                  <span
                    key={k}
                    className={`w-[2px] flex-1 ${k < p.filled ? "bg-sand-200" : "bg-sand-100/12"}`}
                    style={{ height: `${40 + (k / 19) * 60}%` }}
                  />
                ))}
              </div>
              <p className="mt-10 flex items-baseline gap-2 text-sand-100">
                <span className="font-mincho text-sm text-sand-300">
                  {C.perDay}
                  {p.prefix}
                </span>
                <span className="font-serif text-6xl leading-none font-light lining-nums sm:text-7xl">
                  {p.value}
                </span>
                <span className="font-mincho text-lg">件</span>
              </p>
              <p className="mt-5 text-[14px] leading-7 text-sand-100/80">{p.note}</p>
            </Reveal>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[12px] text-sand-300">{C.note}</p>
      {/* 届きすぎないための仕組み */}
      <ul className="mt-14 grid border-t border-sand-100/15 md:mt-16 md:grid-cols-3">
        {C.assurances.map((a, i) => (
          <li
            key={a.en}
            className="border-b border-sand-100/10 py-8 md:border-b-0 md:py-10 md:pr-10 md:[&+li]:border-l md:[&+li]:border-sand-100/10 md:[&+li]:pl-10"
          >
            <Reveal delay={i * 100}>
              <Eyebrow tone="dark" lang="en">
                {a.en}
              </Eyebrow>
              <p className="mt-4 font-mincho text-xl text-sand-100">{a.title}</p>
              <p className="mt-3 max-w-[26em] text-[14px] leading-7 text-sand-100/80">{a.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ───────── 運営と担当 ───────── */

export function StaffSection() {
  const S = HOME.staff;
  return (
    <Section surface="paper">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-24">
        <SectionHead eyebrow={S.eyebrow} title={S.title} index="v." />
        <Reveal delay={120}>
          <p className="max-w-[34em] text-[15px] leading-8 text-ink-700">{S.body}</p>
          <Link
            href="/company"
            className="mt-6 inline-flex min-h-11 items-center gap-3 text-[13px] tracking-[0.08em] text-ink-700 underline decoration-ink-900/30 underline-offset-8 transition-colors duration-500 hover:text-ink-900 hover:decoration-ink-900"
          >
            {S.company}
            <span aria-hidden>→</span>
          </Link>
        </Reveal>
      </div>
      <ol className="mt-16 grid border-t border-ink-900/25 md:mt-20 md:grid-cols-3">
        {S.roles.map((r, i) => (
          <li
            key={r.en}
            className="border-b border-ink-900/15 py-8 md:border-b-0 md:py-12 md:pr-10 md:[&+li]:border-l md:[&+li]:border-ink-900/15 md:[&+li]:pl-10"
          >
            <Reveal delay={i * 100}>
              <span className="font-serif text-sm text-sand-600 italic tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Eyebrow lang="en" className="mt-4">
                {r.en}
              </Eyebrow>
              <p className="mt-3 font-mincho text-xl text-evergreen-900 [word-break:auto-phrase]">
                <Phrase text={r.title} />
              </p>
              <p className="mt-3 max-w-[26em] text-[14px] leading-7 text-ink-500">{r.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ───────── よくあるご質問 ───────── */

export function FaqSection() {
  const Q = HOME.faq;
  return (
    <Section surface="light">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHead eyebrow={Q.eyebrow} title={Q.title} index="vi." />
        </div>
        <div className="border-t border-ink-900/20">
          {Q.items.map((it, i) => (
            <details key={it.q} className="group border-b border-ink-900/15">
              <summary className="flex min-h-11 cursor-pointer list-none items-start gap-4 py-7 sm:gap-5 [&::-webkit-details-marker]:hidden">
                <span className="mt-1 font-serif text-sm text-sand-600 italic tabular-nums">
                  Q.{String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 font-mincho text-[15px] leading-8 text-evergreen-900 sm:text-lg">
                  {it.q}
                </span>
                <span aria-hidden className="relative mt-3 size-3.5 shrink-0">
                  <span className="absolute top-1/2 left-0 h-px w-full bg-ink-900" />
                  <span className="absolute top-0 left-1/2 h-full w-px bg-ink-900 transition-transform duration-500 ease-[var(--ease-luxe)] group-open:scale-y-0" />
                </span>
              </summary>
              <p className="max-w-[36em] pb-8 pl-[2.9rem] text-[15px] leading-8 text-ink-700 sm:pl-[3.25rem]">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ───────── 最後の CTA ───────── */

export function ClosingSection() {
  const C = HOME.closing;
  return (
    <Section
      surface="deep"
      className="bg-[linear-gradient(180deg,#0d1a15_0%,#142821_55%,#1b3a2e_100%)]"
      innerClassName="lg:py-48"
      art={
        <>
          <Contours
            className="pointer-events-none absolute inset-0 size-full text-sand-200/[0.07]"
            rings={14}
          />
          <div
            aria-hidden
            className="absolute top-[-20%] left-1/2 size-[900px] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(circle,rgba(47,101,78,0.45),transparent_62%)]"
          />
        </>
      }
    >
      <Reveal className="flex flex-col items-center text-center">
        <Eyebrow tone="dark" rule lang="en">
          {C.eyebrow}
        </Eyebrow>
        <h2 className="display mt-8 font-mincho text-[2.2rem] text-sand-100 [word-break:auto-phrase] sm:text-6xl lg:text-[5.25rem]">
          <Phrase text={C.title} />
        </h2>
        <p className="mt-8 max-w-[30em] text-[15px] leading-8 text-sand-100/85">{C.body}</p>
        <div className="mt-12">
          <ButtonLink href="/chat" tone="dark" size="lg" arrow>
            {C.cta}
          </ButtonLink>
        </div>
        <p className="mt-6 max-w-[36em] text-[12px] leading-6 text-sand-300">
          <Phrase text={HOME.hero.pricing} />
        </p>
        <p className="mt-14 font-mincho text-sm text-sand-300">
          <Phrase text={BRAND.promise} />
        </p>
      </Reveal>
    </Section>
  );
}
