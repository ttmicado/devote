import Link from "next/link";
import { NAV } from "@/lib/copy";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="bg-evergreen-950 text-sand-200">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:px-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo tone="dark" />
          <p className="mt-6 max-w-xs font-mincho text-sm leading-7 text-sand-300">
            物件探しを、任せられる人へ。
          </p>
        </div>
        <nav aria-label="フッターメニュー" className="grid gap-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="group flex items-baseline gap-4 py-1">
              <span className="eyebrow text-sand-400">{n.en}</span>
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
          中央区勝どき・江東区豊洲
          <br />
          住まいの賃貸・売買／事業用の賃貸
        </div>
      </div>
      <div className="border-t border-sand-100/10">
        <p className="eyebrow mx-auto max-w-[1440px] px-5 py-6 text-sand-400 sm:px-10">
          © {new Date().getFullYear()} Devote Inc.
        </p>
      </div>
    </footer>
  );
}
