import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Devote の共通 UI 部品（.claude/skills/devote-design/SKILL.md）。
 * 面のトーンは "light"（生成り）と "dark"（深緑）の2種類。
 */
export type Tone = "light" | "dark";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * 英字ラベル。英字だけのラベルには lang="en" を渡す（読み上げを英語にする）。
 * 物件の所在地など和文が混ざるラベルでは渡さない。
 */
export function Eyebrow({
  children,
  tone = "light",
  rule = false,
  lang,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  rule?: boolean;
  lang?: string;
  className?: string;
}) {
  return (
    <p
      lang={lang}
      className={cx(
        "eyebrow flex items-center gap-3",
        tone === "dark" ? "text-sand-300" : "text-sand-600",
        className,
      )}
    >
      {rule && <span aria-hidden className="inline-block h-px w-8 bg-current" />}
      {children}
    </p>
  );
}

type Variant = "solid" | "outline" | "ghost";

function buttonClass(variant: Variant, tone: Tone, size: "md" | "lg") {
  return cx(
    "group inline-flex items-center justify-center gap-3 rounded-full font-sans tracking-[0.12em] transition-all duration-500 ease-[var(--ease-luxe)] disabled:pointer-events-none disabled:opacity-40",
    size === "lg" ? "min-h-14 px-8 text-sm" : "min-h-11 px-6 text-[13px]",
    variant === "solid" &&
      (tone === "dark"
        ? "bg-sand-200 text-evergreen-900 hover:bg-sand-50"
        : "bg-evergreen-800 text-sand-50 hover:bg-evergreen-900"),
    variant === "outline" &&
      (tone === "dark"
        ? "border border-sand-200/50 text-sand-100 hover:border-sand-100 hover:bg-sand-100/10"
        : "border border-ink-900/30 text-ink-900 hover:border-ink-900 hover:bg-ink-900/5"),
    variant === "ghost" &&
      (tone === "dark" ? "text-sand-200 hover:text-sand-50" : "text-ink-700 hover:text-ink-900"),
  );
}

const Arrow = () => (
  <span
    aria-hidden
    className="inline-block transition-transform duration-500 ease-[var(--ease-luxe)] group-hover:translate-x-1"
  >
    →
  </span>
);

export function ButtonLink({
  href,
  children,
  variant = "solid",
  tone = "light",
  size = "md",
  arrow = false,
  className,
  ...rest
}: {
  href: string;
  variant?: Variant;
  tone?: Tone;
  size?: "md" | "lg";
  arrow?: boolean;
} & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={cx(buttonClass(variant, tone, size), className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

export function Button({
  children,
  variant = "solid",
  tone = "light",
  size = "md",
  arrow = false,
  className,
  ...rest
}: {
  variant?: Variant;
  tone?: Tone;
  size?: "md" | "lg";
  arrow?: boolean;
} & ComponentProps<"button">) {
  return (
    <button type="button" className={cx(buttonClass(variant, tone, size), className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

/** sondaven.com の円形 CTA */
export function CircleLink({
  href,
  children,
  tone = "dark",
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "group relative flex size-40 items-center justify-center rounded-full border text-center transition-colors duration-700 ease-[var(--ease-luxe)] sm:size-44",
        tone === "dark"
          ? "border-sand-200/50 text-sand-100 hover:bg-sand-100 hover:text-evergreen-900"
          : "border-ink-900/30 text-ink-900 hover:bg-evergreen-800 hover:text-sand-50",
        className,
      )}
    >
      <span className="eyebrow px-6 leading-relaxed">{children}</span>
    </Link>
  );
}

/** 大きな数字と説明（実績・仕組みの数字） */
export function Stat({
  value,
  unit,
  label,
  tone = "light",
}: {
  value: ReactNode;
  unit?: string;
  label: ReactNode;
  tone?: Tone;
}) {
  return (
    <div>
      <p
        className={cx(
          "display flex items-baseline gap-1 text-6xl sm:text-7xl",
          tone === "dark" ? "text-sand-100" : "text-evergreen-900",
        )}
      >
        {value}
        {unit && <span className="font-mincho text-xl tracking-normal sm:text-2xl">{unit}</span>}
      </p>
      <p
        className={cx(
          "mt-3 text-[13px] leading-relaxed",
          tone === "dark" ? "text-sand-300" : "text-ink-500",
        )}
      >
        {label}
      </p>
    </div>
  );
}

/** 各機能画面の見出し（英字ラベル＋明朝の見出し＋リード） */
export function PageHeader({
  eyebrow,
  title,
  lead,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-ink-900/15 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-rise">
        <Eyebrow rule lang="en">
          {eyebrow}
        </Eyebrow>
        <h1 className="display mt-4 font-mincho text-3xl text-evergreen-900 sm:text-[2.6rem]">
          {title}
        </h1>
        {lead && <p className="mt-4 max-w-xl text-sm leading-7 text-ink-500">{lead}</p>}
      </div>
      {aside}
    </header>
  );
}

/** 罫線で区切った定義リスト */
export function SpecList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-ink-900/10 border-y border-ink-900/15">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[6.5rem_1fr] gap-4 py-3.5 text-sm sm:grid-cols-[9rem_1fr]"
        >
          <dt className="eyebrow pt-0.5 text-ink-500">{k}</dt>
          <dd className="whitespace-pre-line leading-7 text-ink-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 空状態・案内 */
export function Notice({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border border-ink-900/15 bg-sand-100/60 px-6 py-12 text-center sm:px-12">
      <p className="display font-mincho text-2xl text-evergreen-900">{title}</p>
      {children && (
        <div className="mx-auto mt-4 max-w-md text-sm leading-7 text-ink-500">{children}</div>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

/** 画面上部の一行メッセージ（保存しました 等） */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <p className="animate-rise border-l-2 border-evergreen-700 bg-evergreen-900 px-5 py-4 text-sm text-sand-100">
      {children}
    </p>
  );
}
