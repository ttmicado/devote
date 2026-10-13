import type { Metadata } from "next";
import { ContactBlock } from "@/components/contact-block";
import { LegalSections } from "@/components/legal-doc";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/ui";
import { LEGAL } from "@/lib/copy";
import { BASE_OPEN_GRAPH } from "@/lib/seo";

const P = LEGAL.privacy;

export const metadata: Metadata = {
  title: P.title,
  description: P.lead,
  alternates: { canonical: "/privacy" },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: `${P.title}｜Devote`,
    description: P.lead,
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <PageShell>
      <PageHeader eyebrow={P.eyebrow} title={P.title} lead={P.lead} />
      <div className="mt-12">
        <LegalSections sections={P.sections} />
        <section
          aria-labelledby="privacy-contact"
          className="grid gap-4 border-b border-ink-900/15 py-8 md:grid-cols-[14rem_1fr] md:gap-10"
        >
          <h2 id="privacy-contact" className="font-mincho text-lg leading-8 text-evergreen-900">
            {P.contactTitle}
          </h2>
          <ContactBlock />
        </section>
        <p className="mt-8 text-xs tracking-[0.08em] text-ink-500">{P.enacted}</p>
      </div>
    </PageShell>
  );
}
