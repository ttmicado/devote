import type { ReactNode } from "react";

type Section = { h: string; body?: string; items?: readonly string[]; note?: string };

/** 個人情報の取り扱い・利用規約の本文（見出し＋本文＋箇条書き、罫線で区切る） */
export function LegalSections({ sections }: { sections: readonly Section[] }) {
  return (
    <div className="divide-y divide-ink-900/10 border-y border-ink-900/15">
      {sections.map((s) => (
        <section key={s.h} className="grid gap-4 py-8 md:grid-cols-[14rem_1fr] md:gap-10">
          <h2 className="font-mincho text-lg leading-8 text-evergreen-900">{s.h}</h2>
          <div className="max-w-[40em] text-sm leading-7 text-ink-700">
            {s.body && <p>{s.body}</p>}
            {s.items && <Bullets items={s.items} className={s.body ? "mt-3" : undefined} />}
            {s.note && <p className="mt-3 text-xs leading-6 text-ink-500">{s.note}</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Bullets({ items, className }: { items: readonly ReactNode[]; className?: string }) {
  return (
    <ul className={`space-y-1.5 ${className ?? ""}`}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[0.85rem] h-px w-3 flex-none bg-current opacity-50" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
