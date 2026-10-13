import type { ReactNode } from "react";
import { Eyebrow, type Tone } from "@/components/ui";
import { Reveal } from "./reveal";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const SURFACE = {
  light: "bg-sand-50 text-ink-900",
  paper: "bg-sand-100 text-ink-900",
  dark: "bg-evergreen-900 text-sand-100",
  deep: "bg-evergreen-950 text-sand-100",
} as const;

export type Surface = keyof typeof SURFACE;
export const toneOf = (s: Surface): Tone => (s === "dark" || s === "deep" ? "dark" : "light");

/** トップの1セクション（フルブリードの面＋1440px の内側） */
export function Section({
  id,
  surface = "light",
  className,
  innerClassName,
  children,
  art,
}: {
  id?: string;
  surface?: Surface;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  art?: ReactNode;
}) {
  return (
    <section id={id} className={cx("relative overflow-hidden", SURFACE[surface], className)}>
      {art}
      <div
        className={cx(
          "relative mx-auto max-w-[1440px] px-5 py-24 sm:px-10 sm:py-32 lg:px-16 lg:py-40",
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * 和文の見出しを「、」「。」の後でだけ折り返す（語の途中で改行しない）。
 * 1区切りが行より長い時は、その中で折り返す。
 */
export function Phrase({ text }: { text: string }) {
  return (
    <>
      {text.split(/(?<=[、。])/).map((seg, i) => (
        <span key={i} className="inline-block">
          {seg}
        </span>
      ))}
    </>
  );
}

/** 英字ラベル＋明朝の見出し＋本文 */
export function SectionHead({
  eyebrow,
  title,
  body,
  tone = "light",
  index,
  className,
  size = "lg",
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  tone?: Tone;
  index?: string;
  className?: string;
  size?: "lg" | "xl";
}) {
  const dark = tone === "dark";
  return (
    <Reveal className={className}>
      <div className="flex items-center gap-4">
        {index && (
          <span
            className={cx("font-serif text-sm italic", dark ? "text-sand-400" : "text-sand-600")}
          >
            {index}
          </span>
        )}
        <Eyebrow tone={tone} rule lang="en">
          {eyebrow}
        </Eyebrow>
      </div>
      <h2
        className={cx(
          "display mt-6 font-mincho [word-break:auto-phrase]",
          size === "xl"
            ? "text-[2.1rem] sm:text-5xl lg:text-[4rem]"
            : "text-[1.85rem] sm:text-[2.6rem] lg:text-[3.25rem]",
          dark ? "text-sand-100" : "text-evergreen-900",
        )}
      >
        {typeof title === "string" ? <Phrase text={title} /> : title}
      </h2>
      {body && (
        <p
          className={cx(
            "mt-7 max-w-[36em] text-[15px] leading-8",
            dark ? "text-sand-100/90" : "text-ink-700",
          )}
        >
          {body}
        </p>
      )}
    </Reveal>
  );
}
