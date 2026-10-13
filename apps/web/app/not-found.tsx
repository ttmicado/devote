import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ButtonLink, Notice } from "@/components/ui";
import { ERRORS } from "@/lib/copy";

export const metadata: Metadata = {
  title: ERRORS.notFound.title,
  robots: { index: false, follow: false },
};

const N = ERRORS.notFound;

export default function NotFound() {
  return (
    <PageShell>
      <div className="animate-rise">
        <Notice
          title={N.title}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/matches" arrow>
                {N.primary}
              </ButtonLink>
              <ButtonLink href="/chat" variant="outline">
                {N.secondary}
              </ButtonLink>
            </div>
          }
        >
          {N.body}
        </Notice>
      </div>
    </PageShell>
  );
}
