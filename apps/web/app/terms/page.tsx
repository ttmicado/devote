import type { Metadata } from "next";
import { LegalSections } from "@/components/legal-doc";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/ui";
import { LEGAL } from "@/lib/copy";
import { BASE_OPEN_GRAPH } from "@/lib/seo";

const T = LEGAL.terms;

export const metadata: Metadata = {
  title: T.title,
  description: T.lead,
  alternates: { canonical: "/terms" },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: `${T.title}｜Devote`,
    description: T.lead,
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <PageShell>
      <PageHeader eyebrow={T.eyebrow} title={T.title} lead={T.lead} />
      <div className="mt-12">
        <LegalSections sections={T.sections} />
        <p className="mt-8 text-xs tracking-[0.08em] text-ink-500">{T.enacted}</p>
      </div>
    </PageShell>
  );
}
