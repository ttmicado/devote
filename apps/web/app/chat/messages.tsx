import { CHAT } from "@/lib/copy";

/**
 * 対話の一行。チャットアプリの吹き出しにはしない。
 * コンシェルジュの発言は罫線で区切った明朝の文面、ご本人の発言は右寄せの控えめな面。
 */
export function AssistantLine({ text, className }: { text: string; className?: string }) {
  return (
    <li
      className={`grid gap-2 border-t border-ink-900/15 pt-4 sm:grid-cols-[7.5rem_1fr] sm:gap-6 ${className ?? ""}`}
    >
      <p className="eyebrow text-sand-600 sm:pt-1.5">{CHAT.eyebrow}</p>
      <p className="whitespace-pre-wrap font-mincho text-[15px] leading-8 text-ink-900 [word-break:auto-phrase] sm:text-base sm:leading-[2.1]">
        {text}
      </p>
    </li>
  );
}

export function UserLine({ text }: { text: string }) {
  return (
    <li className="flex justify-end">
      <p className="sr-only">{CHAT.you}:</p>
      <p className="max-w-[85%] whitespace-pre-wrap border border-ink-900/10 bg-sand-100 px-5 py-3.5 text-[15px] leading-7 text-ink-700 sm:max-w-[70%]">
        {text}
      </p>
    </li>
  );
}

export function ThinkingLine() {
  return (
    <li className="grid gap-2 border-t border-ink-900/15 pt-4 sm:grid-cols-[7.5rem_1fr] sm:gap-6">
      <p className="eyebrow text-sand-600 sm:pt-1.5">{CHAT.eyebrow}</p>
      <p className="flex items-center gap-3 font-mincho text-[15px] leading-8 text-ink-500">
        {CHAT.thinking}
        <span aria-hidden className="flex gap-1.5">
          {[0, 400, 800].map((d) => (
            <span
              key={d}
              className="size-1 rounded-full bg-sand-600 animate-pulse-dot"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      </p>
    </li>
  );
}

export function StarterChips({
  onPick,
  className,
}: {
  onPick: (text: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`animate-rise sm:pl-[9rem] ${className ?? ""}`}
      style={{ animationDelay: "160ms" }}
    >
      <p className="eyebrow text-ink-500">{CHAT.startersLabel}</p>
      <ul className="mt-3 flex flex-wrap gap-2.5">
        {CHAT.starters.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="min-h-11 rounded-full border border-ink-900/25 px-5 text-left text-[13px] leading-6 tracking-[0.04em] text-ink-700 transition-colors duration-500 ease-[var(--ease-luxe)] hover:border-evergreen-800 hover:bg-evergreen-800 hover:text-sand-50"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
