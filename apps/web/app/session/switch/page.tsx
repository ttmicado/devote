import { verifyUserLink } from "@devote/services";
import { PageShell } from "@/components/page-shell";
import { Button, ButtonLink, Notice, PageHeader } from "@/components/ui";
import { SECURITY_COPY } from "@/lib/copy";
import { safePath } from "@/lib/safe-path";
import { switchSession } from "./actions";

export const dynamic = "force-dynamic";

const C = SECURITY_COPY.sessionSwitch;

export default async function SessionSwitchPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; next?: string; expired?: string }>;
}) {
  const { t, next: rawNext, expired } = await searchParams;
  const next = safePath(rawNext);
  const valid = !expired && Boolean(t && verifyUserLink(t));
  return (
    <PageShell>
      <PageHeader eyebrow={C.eyebrow} title={C.title} lead={valid ? C.lead : undefined} />
      <div className="mt-12 max-w-xl">
        {valid ? (
          <form action={switchSession} className="space-y-8">
            <input type="hidden" name="t" value={t} />
            <input type="hidden" name="next" value={next} />
            <p className="text-sm leading-7 text-ink-500">{C.note}</p>
            <div className="flex flex-wrap gap-4">
              <Button type="submit" arrow>
                {C.submit}
              </Button>
              <ButtonLink href={next} variant="outline">
                {C.stay}
              </ButtonLink>
            </div>
          </form>
        ) : (
          <Notice
            title={C.expiredTitle}
            action={
              <ButtonLink href={next} variant="outline">
                {C.stay}
              </ButtonLink>
            }
          >
            {C.expired}
          </Notice>
        )}
      </div>
    </PageShell>
  );
}
