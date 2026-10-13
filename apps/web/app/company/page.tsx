import { COMPANY, companyRows } from "@devote/core";
import type { Metadata } from "next";
import { ContactBlock } from "@/components/contact-block";
import { PageShell } from "@/components/page-shell";
import { Eyebrow, PageHeader, SpecList } from "@/components/ui";
import { CONTACT, LEGAL } from "@/lib/copy";
import { BASE_OPEN_GRAPH } from "@/lib/seo";

const C = LEGAL.company;

export const metadata: Metadata = {
  title: C.title,
  description: C.lead,
  alternates: { canonical: "/company" },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: `${C.title}｜Devote`,
    description: C.lead,
    url: "/company",
  },
};

export default function CompanyPage() {
  const host = COMPANY.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const rows: [string, React.ReactNode][] = [
    ...companyRows(),
    [C.transactionMode, COMPANY.transactionMode],
    [C.areas, C.areasValue],
    [C.kinds, C.kindsValue],
    [
      C.site,
      <a
        key="site"
        href={COMPANY.url}
        target="_blank"
        rel="noopener noreferrer"
        className="border-b border-ink-900/30 transition-colors duration-500 hover:border-ink-900"
      >
        {host}
        <span aria-hidden className="ml-1.5 text-ink-500">
          ↗
        </span>
      </a>,
    ],
  ];
  return (
    <PageShell>
      <PageHeader eyebrow={C.eyebrow} title={C.title} lead={C.lead} />
      <div className="mt-12 grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
        <section aria-labelledby="operator">
          <h2 id="operator" className="sr-only">
            {C.rowsTitle}
          </h2>
          <SpecList rows={rows} />
          <div className="mt-12 border-l border-sand-500 pl-5">
            <Eyebrow>{C.role}</Eyebrow>
            <p className="mt-3 max-w-[40em] text-sm leading-7 text-ink-700">{C.roleBody}</p>
          </div>
        </section>
        <aside
          id="contact"
          aria-labelledby="contact-title"
          className="h-fit scroll-mt-32 border border-ink-900/15 bg-sand-100/60 p-8"
        >
          <Eyebrow rule>{CONTACT.eyebrow}</Eyebrow>
          <h2 id="contact-title" className="display mt-4 font-mincho text-2xl text-evergreen-900">
            {CONTACT.title}
          </h2>
          <p className="mt-3 text-sm leading-7 text-ink-500">{CONTACT.lead}</p>
          <div className="mt-6">
            <ContactBlock />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
