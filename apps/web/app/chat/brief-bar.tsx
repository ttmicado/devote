import type { SearchCondition } from "@devote/core";
import { briefHeadline } from "@/components/condition-summary";
import { CHAT } from "@/lib/copy";

/** スマホ: 画面上部に固定する「承ったご希望」の折りたたみバー（タップで依頼書を展開） */
export function BriefBar({
  condition,
  open,
  onToggle,
  controls,
}: {
  condition: SearchCondition;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const { text, rest } = briefHeadline(condition);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="flex h-16 w-full shrink-0 items-center gap-4 border-b border-ink-900/15 bg-sand-100/70 px-5 text-left sm:px-10 lg:hidden"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="eyebrow text-sand-600">
            {CHAT.briefEyebrow}
            <span className="sr-only">（{CHAT.briefTitle}）</span>
          </span>
          {rest > 0 && (
            <span className="text-[11px] tracking-[0.08em] text-ink-500">
              {CHAT.briefMore(rest)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mincho text-[15px] leading-6 text-ink-900">
          {text || <span className="text-ink-500">{CHAT.briefBarEmpty}</span>}
        </span>
      </span>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink-900/20 text-ink-700"
      >
        <svg
          viewBox="0 0 12 12"
          className={`size-3 transition-transform duration-500 ease-[var(--ease-luxe)] ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
    </button>
  );
}
