import { InquirySteps } from "@/components/inquiry-steps";
import { PageShell } from "@/components/page-shell";
import { PropertyCard, PropertyCompact } from "@/components/property-card";
import { ButtonLink, Eyebrow, Notice, PageHeader, Toast } from "@/components/ui";
import { VIEWINGS } from "@/lib/copy";
import { userInquiries } from "@/lib/data";
import { currentUserId } from "@/lib/session";
import { formatJst } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** preferred_dates は jsonb（文字列で保存されている） */
const datesText = (v: unknown) =>
  typeof v === "string"
    ? v
    : Array.isArray(v)
      ? v.filter((x) => typeof x === "string").join("、")
      : null;

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const userId = await currentUserId();
  const list = userId ? await userInquiries(userId) : [];

  return (
    <PageShell>
      <PageHeader eyebrow={VIEWINGS.eyebrow} title={VIEWINGS.title} lead={VIEWINGS.lead} />

      {created === "1" && (
        <div className="mt-8">
          <Toast>{VIEWINGS.created}</Toast>
        </div>
      )}

      {list.length === 0 ? (
        <div className="mt-12">
          <Notice
            title={VIEWINGS.emptyTitle}
            action={
              <ButtonLink href="/matches" variant="outline" arrow>
                {VIEWINGS.emptyCta}
              </ButtonLink>
            }
          >
            {VIEWINGS.emptyBody}
          </Notice>
        </div>
      ) : (
        <ol className="mt-4">
          {list.map((q, i) => {
            const dates = datesText(q.preferredDates);
            return (
              <li
                key={q.id}
                className="animate-rise border-b border-ink-900/15 py-12 sm:py-14"
                style={{ animationDelay: `${120 + i * 100}ms` }}
              >
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="font-serif text-2xl text-sand-600 tabular-nums lining-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs tracking-[0.08em] text-ink-500">
                    {formatJst(q.createdAt, true)} {VIEWINGS.received}
                    {dates && (
                      <>
                        <span aria-hidden className="px-2 text-sand-500">
                          ·
                        </span>
                        {VIEWINGS.preferred} {dates}
                      </>
                    )}
                  </span>
                </div>

                <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
                  <PropertyCompact id={q.propertyId} listing={q.listing} />
                  <div className="lg:pt-2">
                    <InquirySteps status={q.status} />
                    {q.status === "unavailable" && q.suggestions.length > 0 && (
                      <p className="mt-4 pl-5 text-[13px] text-ink-500">
                        {VIEWINGS.declinedFollow}
                      </p>
                    )}
                  </div>
                </div>

                {q.suggestions.length > 0 && (
                  <section
                    aria-labelledby={`alt-${q.id}`}
                    className="-mx-5 mt-12 bg-sand-100/70 px-5 py-12 sm:mx-0 sm:px-10 sm:py-10"
                  >
                    <Eyebrow rule>{VIEWINGS.alternativesEyebrow}</Eyebrow>
                    <h2
                      id={`alt-${q.id}`}
                      className="display mt-3 font-mincho text-2xl text-evergreen-900"
                    >
                      {VIEWINGS.alternativesTitle}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-ink-500">
                      {VIEWINGS.alternativesLead}
                    </p>
                    <div className="mt-8 grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                      {q.suggestions.map((s) => (
                        <PropertyCard key={s.id} id={s.propertyId} listing={s.listing} />
                      ))}
                    </div>
                  </section>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </PageShell>
  );
}
