import { PageShell } from "@/components/page-shell";
import { Button, ButtonLink, Notice, PageHeader } from "@/components/ui";
import { SECURITY_COPY } from "@/lib/copy";
import { confirmEmail } from "./actions";

export const dynamic = "force-dynamic";

const C = SECURITY_COPY.emailVerify;

export default async function EmailVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; result?: string }>;
}) {
  const { token, result } = await searchParams;
  const problem = result === "taken" ? "taken" : result === "expired" || !token ? "expired" : null;
  return (
    <PageShell>
      <PageHeader eyebrow={C.eyebrow} title={C.title} lead={problem ? undefined : C.lead} />
      <div className="mt-12 max-w-xl">
        {problem ? (
          <Notice
            title={problem === "taken" ? C.takenTitle : C.expiredTitle}
            action={
              <ButtonLink href="/settings" variant="outline">
                {C.toSettings}
              </ButtonLink>
            }
          >
            {problem === "taken" ? C.taken : C.expired}
          </Notice>
        ) : (
          <form action={confirmEmail}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" arrow>
              {C.submit}
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
