import { COMPANY } from "@devote/core";
import Link from "next/link";
import { LEGAL, NAV } from "@/lib/copy";
import { Logo } from "./logo";

const F = LEGAL.footer;

const LEGAL_LINKS = [
  { href: "/company", label: F.company },
  { href: "/privacy", label: F.privacy },
  { href: "/terms", label: F.terms },
  { href: "/login", label: F.login },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-evergreen-950 text-sand-200">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:px-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo tone="dark" />
          <p className="mt-6 max-w-xs font-mincho text-sm leading-7 text-sand-300">
            物件探しを、任せられる人へ。
          </p>
          <dl className="mt-8 space-y-1 text-[13px] leading-6 text-sand-300">
            <div className="flex flex-wrap gap-x-3">
              <dt className="text-sand-400">{F.operator}</dt>
              <dd>{COMPANY.name}</dd>
            </div>
            {COMPANY.license && (
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-sand-400">{F.license}</dt>
                <dd>{COMPANY.license}</dd>
              </div>
            )}
          </dl>
        </div>
        <nav aria-label="フッターメニュー" className="grid content-start gap-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="group flex items-baseline gap-4 py-1">
              <span className="eyebrow w-28 flex-none text-sand-400">{n.en}</span>
              <span className="text-sm text-sand-200 transition-colors group-hover:text-sand-50">
                {n.ja}
              </span>
            </Link>
          ))}
        </nav>
        <div className="text-sm leading-7 text-sand-300">
          <p className="eyebrow mb-3 text-sand-400">Coverage</p>
          港区・渋谷区・千代田区・品川区
          <br />
          中央区勝どき・晴海・江東区豊洲
          <br />
          住まいの賃貸・売買
        </div>
      </div>
      <div className="border-t border-sand-100/10">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <nav aria-label={F.legalNav}>
            <ul className="flex flex-wrap gap-x-6">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-11 items-center text-xs tracking-[0.08em] text-sand-300 transition-colors duration-500 hover:text-sand-50"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="eyebrow text-sand-400">
            © {new Date().getFullYear()} {COMPANY.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
