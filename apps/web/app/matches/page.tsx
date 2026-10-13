import { PHASE_GATE } from "@devote/core";
import Link from "next/link";
import { ConditionSummary, conditionLines } from "@/components/condition-summary";
import { PageShell } from "@/components/page-shell";
import { PropertyCard } from "@/components/property-card";
import { ReportPanel } from "@/components/report-panel";
import { ButtonLink, Eyebrow, Notice, PageHeader, Toast } from "@/components/ui";
import { SELECTIONS } from "@/lib/copy";
import { userMatches } from "@/lib/data";
import { groupByBuilding } from "@/lib/listing-view";
import { currentUserId } from "@/lib/session";
import { userReport } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; all?: string }>;
}) {
  const { confirmed, all } = await searchParams;
  const userId = await currentUserId();
  const [{ condition, items }, report] = userId
    ? await Promise.all([userMatches(userId), userReport(userId)])
    : [{ condition: null, items: [] }, null];

  // 検討段階のゲージで「今回の厳選」を絞る（比較検討中なら8件）。残りは希望者だけに
  // 同じ建物の部屋は1枚にまとめる（並びは userMatches の順: 適合度 → 新しさ → 総額）
  const gate = condition ? PHASE_GATE[condition.phase] : null;
  const groups = groupByBuilding(items);
  const shown = all || !gate ? groups : groups.slice(0, gate.maxItems);
  const rest = groups.length - shown.length;
  const now = new Date();

  return (
    <PageShell>
      <PageHeader eyebrow={SELECTIONS.eyebrow} title={SELECTIONS.title} lead={SELECTIONS.lead} />

      {confirmed === "1" && (
        <div className="mt-8">
          <Toast>{SELECTIONS.confirmed}</Toast>
        </div>
      )}

      {!condition ? (
        <div className="mt-12">
          <Notice
            title={SELECTIONS.noCondition.title}
            action={
              <ButtonLink href="/chat" arrow>
                {SELECTIONS.noCondition.cta}
              </ButtonLink>
            }
          >
            {SELECTIONS.noCondition.body}
          </Notice>
        </div>
      ) : (
        <>
          {report && (
            <div className="-mx-5 mt-10 sm:mx-0">
              <ReportPanel report={report} />
            </div>
          )}

          <details className="group/brief mt-6 border-b border-ink-900/15">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="eyebrow flex-none text-ink-500">{SELECTIONS.brief}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-700">
                {conditionLines(condition.condition)
                  .slice(0, 5)
                  .map(([, v]) => v)
                  .join(" · ")}
              </span>
              <span
                aria-hidden
                className="relative size-3 flex-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-ink-700 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-ink-700 after:transition-transform after:duration-500 group-open/brief:after:scale-y-0"
              />
            </summary>
            <div className="grid gap-6 pt-2 pb-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <ConditionSummary condition={condition.condition} />
              <Link
                href="/chat"
                className="group inline-flex min-h-11 items-center gap-2 justify-self-start text-[13px] tracking-[0.12em] text-evergreen-800"
              >
                <span className="border-b border-evergreen-800/40 pb-0.5 transition-colors duration-500 group-hover:border-evergreen-800">
                  {SELECTIONS.review}
                </span>
                <span
                  aria-hidden
                  className="transition-transform duration-500 group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </details>

          {items.length === 0 ? (
            <div className="mt-12">
              <Notice
                title={SELECTIONS.noMatches.title}
                action={
                  <ButtonLink href="/chat" variant="outline" arrow>
                    {SELECTIONS.noMatches.cta}
                  </ButtonLink>
                }
              >
                {SELECTIONS.noMatches.body}
              </Notice>
            </div>
          ) : (
            <section aria-labelledby="shortlist" className="mt-16">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div>
                  <Eyebrow rule>{SELECTIONS.listEyebrow}</Eyebrow>
                  <h2
                    id="shortlist"
                    className="display mt-3 font-mincho text-2xl text-evergreen-900"
                  >
                    {SELECTIONS.listTitle}
                  </h2>
                </div>
                <p className="pb-1 text-xs tracking-[0.12em] text-ink-500">
                  <span className="font-serif text-base text-ink-700 tabular-nums lining-nums">
                    {shown.length}
                  </span>
                  {SELECTIONS.listCount}
                  <span aria-hidden className="px-2 text-sand-500">
                    ·
                  </span>
                  {SELECTIONS.listOrder}
                </p>
              </div>
              <div className="mt-8 grid gap-x-10 gap-y-16 border-t border-ink-900/15 pt-10 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map(({ lead: m, others }) => (
                  <PropertyCard
                    key={m.propertyId}
                    id={m.propertyId}
                    listing={m.listing}
                    score={m.score}
                    reasons={m.reasons}
                    firstSeen={m.firstSeen}
                    now={now}
                    siblings={others.map((o) => ({ id: o.propertyId, listing: o.listing }))}
                  />
                ))}
              </div>
              {rest > 0 && (
                <div className="mt-16 flex flex-col items-center gap-3 border-t border-ink-900/15 pt-10 text-center">
                  <p className="text-sm leading-7 text-ink-500">{SELECTIONS.moreNote(rest)}</p>
                  <ButtonLink href="/matches?all=1" variant="outline" arrow>
                    {SELECTIONS.moreCta}
                  </ButtonLink>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
