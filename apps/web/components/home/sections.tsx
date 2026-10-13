import { ButtonLink, CircleLink, Eyebrow, Stat } from "@/components/ui";
import { AREAS, BRAND, HOME, PREFERENCES, VIEWINGS } from "@/lib/copy";
import { Contours, Skyline } from "./line-art";
import { Reveal } from "./reveal";
import { Phrase, Section, SectionHead } from "./section";

/* ───────── 課題提起: 情報の流れ（3段の図解） ───────── */

const RING = ["size-7 sm:size-14", "size-[54px] sm:size-[110px]", "size-[84px] sm:size-[176px]"];

export function ProblemSection() {
  const P = HOME.problem;
  return (
    <Section surface="light">
      <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-24">
        <SectionHead eyebrow={P.eyebrow} title={P.title} index="i." />
        <Reveal delay={120} className="lg:pt-14">
          <p className="max-w-[36em] text-[15px] leading-8 text-ink-700">{P.body}</p>
        </Reveal>
      </div>

      <Reveal delay={160} className="mt-20 lg:mt-28">
        <div className="relative grid sm:grid-cols-3">
          {/* 流れの線（モバイルは縦、デスクトップは横） */}
          <span
            aria-hidden
            className="absolute top-[42px] bottom-[42px] left-[50px] w-px bg-ink-900/20 sm:top-[100px] sm:right-[16%] sm:bottom-auto sm:left-[16%] sm:h-px sm:w-auto"
          />
          {P.steps.map((s, i) => (
            <div
              key={s.en}
              className="relative grid grid-cols-[100px_1fr] items-center gap-5 py-3 sm:block sm:py-0"
            >
              <div className="relative flex h-[84px] items-center justify-center sm:h-[200px]">
                <span
                  className={`relative flex items-center justify-center rounded-full border ${RING[i]} ${
                    i === 0
                      ? "border-evergreen-800 bg-evergreen-800"
                      : "border-ink-900/25 bg-sand-50"
                  }`}
                >
                  {i === 0 && (
                    <span
                      aria-hidden
                      className="absolute -inset-2 animate-pulse-dot rounded-full border border-evergreen-800/40 sm:-inset-3"
                    />
                  )}
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${i === 0 ? "bg-sand-100" : "bg-ink-900/40"}`}
                  />
                </span>
              </div>
              <div className="sm:mt-8 sm:px-6 sm:text-center lg:px-10">
                <p className="font-serif text-2xl text-sand-600 italic sm:text-[2rem]">{s.en}</p>
                <p className="mt-1 font-mincho text-[17px] text-evergreen-900 sm:mt-3 sm:text-xl">
                  {s.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-6 text-ink-500">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center gap-4 border-t border-ink-900/15 pt-8 sm:justify-center">
          <span aria-hidden className="size-2 rounded-full bg-evergreen-800" />
          <p className="font-mincho text-base text-evergreen-900 sm:text-lg">{P.caption}</p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ───────── 3つの約束 ───────── */

export function PromiseSection() {
  const P = HOME.promise;
  return (
    <Section surface="dark">
      <SectionHead eyebrow={P.eyebrow} title={P.title} tone="dark" index="ii." size="xl" />
      <div className="mt-16 border-b border-sand-100/10 lg:mt-24">
        {P.items.map((it, i) => (
          <Reveal key={it.no} delay={i * 100}>
            <article className="grid gap-6 border-t border-sand-100/10 py-12 lg:grid-cols-[7rem_13rem_1fr_15rem] lg:gap-10 lg:py-16">
              <p className="font-serif text-6xl leading-none font-light text-sand-300 lg:text-7xl">
                {it.no}
              </p>
              <div>
                <Eyebrow tone="dark">{it.en}</Eyebrow>
                <p className="mt-2 font-mincho text-lg text-sand-200">{it.ja}</p>
              </div>
              <div>
                <h3 className="display font-mincho text-2xl text-sand-100 [word-break:auto-phrase] sm:text-[2rem]">
                  <Phrase text={it.title} />
                </h3>
                <p className="mt-5 max-w-[34em] text-[15px] leading-8 text-sand-100/85">
                  {it.body}
                </p>
              </div>
              <div className="lining-nums lg:border-l lg:border-sand-100/10 lg:pl-10">
                <Stat tone="dark" value={it.stat.value} unit={it.stat.unit} label={it.stat.label} />
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ───────── ご利用の流れ ───────── */

export function FlowSection() {
  const F = HOME.flow;
  return (
    <Section surface="paper">
      <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <SectionHead eyebrow={F.eyebrow} title={F.title} index="iii." className="max-w-3xl" />
        <Reveal delay={120}>
          <ButtonLink href="/chat" arrow>
            {F.cta}
          </ButtonLink>
        </Reveal>
      </div>
      <ol className="mt-16 grid gap-0 sm:mt-24 md:grid-cols-3 md:gap-10 lg:gap-16">
        {F.steps.map((s, i) => (
          <Reveal key={s.no} delay={i * 120}>
            <li className="relative border-t border-ink-900/20 pt-8 pb-12 md:pb-0">
              <span aria-hidden className="absolute -top-px left-0 h-px w-16 bg-evergreen-800" />
              <p className="font-serif text-[5.5rem] leading-none font-light text-evergreen-900 lining-nums tabular-nums lg:text-[7rem]">
                {s.no}
              </p>
              <h3 className="mt-6 font-mincho text-2xl text-evergreen-900">{s.title}</h3>
              <p className="mt-4 max-w-[24em] text-[15px] leading-8 text-ink-700">{s.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ───────── 情報源 ───────── */

export function SourcesSection() {
  const S = HOME.sources;
  return (
    <Section surface="light">
      <div className="grid gap-14 lg:grid-cols-[1fr_1.3fr] lg:gap-24">
        <SectionHead eyebrow={S.eyebrow} title={S.title} body={S.body} index="v." />
        <div>
          <div className="border-t border-ink-900/25">
            {S.groups.map((g, gi) => (
              <Reveal key={g.en} delay={gi * 140}>
                <div className="grid gap-3 border-b border-ink-900/15 py-8 sm:grid-cols-[3rem_1fr] sm:gap-6">
                  <span className="font-serif text-sm text-ink-500 italic tabular-nums">
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <Eyebrow>{g.en}</Eyebrow>
                    <p className="mt-2 font-mincho text-xl text-evergreen-900">{g.ja}</p>
                    <p className="mt-3 text-[14px] leading-7 text-ink-500">{g.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-[12px] text-ink-500">
            <span
              aria-hidden
              className="size-1.5 animate-pulse-dot rounded-full bg-evergreen-700"
            />
            {S.note}
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ───────── 検討段階に合わせた厳選（3段階のゲージ） ───────── */

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

export function CurationSection() {
  const C = HOME.curation;
  return (
    <Section surface="deep">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-24">
        <SectionHead eyebrow={C.eyebrow} title={C.title} tone="dark" index="vi." />
        <Reveal delay={120}>
          <p className="max-w-[34em] text-[15px] leading-8 text-sand-100/85">{C.body}</p>
        </Reveal>
      </div>
      <div className="mt-16 grid gap-px bg-sand-100/10 md:mt-24 md:grid-cols-3">
        {PHASES.map((p, i) => (
          <Reveal key={p.key} delay={i * 120} className="h-full">
            <div
              className={`flex h-full flex-col p-7 sm:p-10 ${p.key === "ready" ? "bg-evergreen-800" : "bg-evergreen-950"}`}
            >
              <div className="flex items-center justify-between">
                <span className="eyebrow text-sand-300">Phase {i + 1}</span>
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
                {p.prefix && <span className="font-mincho text-sm text-sand-300">{p.prefix}</span>}
                <span className="font-serif text-6xl leading-none font-light lining-nums sm:text-7xl">
                  {p.value}
                </span>
                <span className="font-mincho text-lg">件</span>
              </p>
              <p className="mt-5 text-[14px] leading-7 text-sand-100/80">{p.note}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-sand-300">{C.note}</p>
    </Section>
  );
}

/* ───────── 内見と代替のご提案 ───────── */

export function ViewingSection() {
  const V = HOME.viewing;
  return (
    <Section surface="light">
      <div className="grid gap-16 lg:grid-cols-[1.15fr_1fr] lg:gap-24">
        <div>
          <SectionHead eyebrow={V.eyebrow} title={V.title} body={V.body} index="vii." />
          <Reveal delay={140}>
            <ol className="relative mt-14 grid grid-cols-5" aria-label={VIEWINGS.title}>
              <span
                aria-hidden
                className="absolute top-[7px] right-[10%] left-[10%] h-px bg-ink-900/20"
              />
              {VIEWINGS.steps.map((s, i) => (
                <li key={s} className="relative flex flex-col items-center gap-3 text-center">
                  <span
                    className={`size-[15px] rounded-full border ${
                      i === 0
                        ? "border-evergreen-800 bg-evergreen-800"
                        : "border-ink-900/30 bg-sand-50"
                    }`}
                  />
                  <span className="text-[11px] leading-5 text-ink-700 sm:text-[13px]">{s}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
        <Reveal delay={200} className="lg:pt-10">
          <div className="relative overflow-hidden border border-ink-900/15 bg-sand-100 px-7 py-10 sm:px-12 sm:py-14">
            <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-evergreen-900/[0.08]" />
            <Eyebrow>{VIEWINGS.alternativesEyebrow}</Eyebrow>
            <h3 className="display mt-5 font-mincho text-[1.6rem] text-evergreen-900 [word-break:auto-phrase] sm:text-[2rem]">
              <Phrase text={V.subTitle} />
            </h3>
            <p className="relative mt-6 text-[15px] leading-8 text-ink-700">{V.subBody}</p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ───────── 対象エリア ───────── */

export function AreasSection() {
  const A = HOME.areas;
  return (
    <Section
      surface="dark"
      art={
        <Contours
          className="pointer-events-none absolute inset-0 size-full text-sand-200/[0.06]"
          rings={22}
        />
      }
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-24">
        <SectionHead eyebrow={A.eyebrow} title={A.title} tone="dark" index="viii." />
        <Reveal delay={120}>
          <p className="max-w-[34em] text-[15px] leading-8 text-sand-100/85">{A.body}</p>
        </Reveal>
      </div>
      <ul className="mt-16 grid border-b border-sand-100/10 lg:mt-24 lg:grid-cols-2 lg:gap-x-16">
        {AREAS.map((a, i) => (
          <li key={a.en} className="border-t border-sand-100/10">
            <Reveal delay={(i % 2) * 100}>
              <div className="group flex items-baseline gap-5 py-6 sm:gap-8 sm:py-8">
                <span className="eyebrow w-6 shrink-0 text-sand-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-serif text-[3rem] leading-none font-light tracking-[-0.02em] text-sand-100 transition-transform duration-700 ease-[var(--ease-luxe)] group-hover:translate-x-2 sm:text-[4.5rem] lg:text-[5rem]">
                  {a.en}
                </span>
                <span className="ml-auto shrink-0 font-mincho text-sm text-sand-300 sm:text-base">
                  {a.ja}
                </span>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
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
          <SectionHead eyebrow={Q.eyebrow} title={Q.title} index="ix." />
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
              <p className="max-w-[36em] pb-8 pl-[2.9rem] text-[15px] sm:pl-[3.25rem] leading-8 text-ink-700">
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
            rings={18}
          />
          <div
            aria-hidden
            className="absolute top-[-20%] left-1/2 size-[900px] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(circle,rgba(47,101,78,0.45),transparent_62%)]"
          />
        </>
      }
    >
      <Reveal className="flex flex-col items-center text-center">
        <Eyebrow tone="dark" rule>
          {C.eyebrow}
        </Eyebrow>
        <h2 className="display mt-8 font-mincho text-[2.2rem] text-sand-100 [word-break:auto-phrase] sm:text-6xl lg:text-[5.25rem]">
          <Phrase text={C.title} />
        </h2>
        <p className="mt-8 max-w-[30em] text-[15px] leading-8 text-sand-100/85">{C.body}</p>
        <div className="mt-12 flex flex-col items-center gap-8 sm:flex-row sm:gap-12">
          <ButtonLink href="/chat" tone="dark" size="lg" arrow>
            {C.cta}
          </ButtonLink>
          <CircleLink href="/chat" className="hidden sm:flex">
            {C.eyebrow} →
          </CircleLink>
        </div>
        <p className="mt-16 font-mincho text-sm text-sand-300">
          <Phrase text={BRAND.promise} />
        </p>
      </Reveal>
    </Section>
  );
}
