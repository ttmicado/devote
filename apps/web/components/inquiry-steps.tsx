import { VIEWINGS } from "@/lib/copy";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** 依頼の状態 → ステップの位置（unavailable は別表示のため含めない） */
const STEP_INDEX: Record<string, number> = {
  new: 0,
  checking: 1,
  available: 2,
  viewing_scheduled: 3,
  closed: 4,
};

type Status = keyof typeof VIEWINGS.status;

/** 内見のご依頼の進み具合（横向きのステッパー＋状態の補足文） */
export function InquirySteps({ status }: { status: string }) {
  const info = VIEWINGS.status[status as Status];

  if (status === "unavailable") {
    return (
      <div className="border-l border-sand-500 pl-5">
        <p className="eyebrow text-sand-600">{VIEWINGS.declinedEyebrow}</p>
        <p className="mt-2 font-mincho text-xl text-ink-900">{info.label}</p>
        <p className="mt-2 text-sm leading-7 text-ink-700">{info.note}</p>
      </div>
    );
  }

  const current = STEP_INDEX[status] ?? 0;
  return (
    <div>
      <ol className="grid grid-cols-5">
        {VIEWINGS.steps.map((label, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={label} aria-current={now ? "step" : undefined} className="relative">
              {/* 前のステップとの間の線 */}
              {i > 0 && (
                <span
                  aria-hidden
                  className={cx(
                    "absolute top-[5px] right-1/2 left-[-50%] h-px",
                    i <= current ? "bg-evergreen-700" : "bg-ink-900/15",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cx(
                  "relative mx-auto block size-[11px] rounded-full border",
                  done && "border-evergreen-700 bg-evergreen-700",
                  now && "border-evergreen-800 bg-sand-50 ring-4 ring-evergreen-800/15",
                  !done && !now && "border-ink-900/25 bg-sand-50",
                )}
              >
                {now && <span className="absolute inset-[2px] rounded-full bg-evergreen-800" />}
              </span>
              <span
                className={cx(
                  "mt-3 block text-center text-[11px] leading-snug tracking-[0.04em] sm:text-xs",
                  now ? "font-medium text-ink-900" : done ? "text-ink-700" : "text-ink-500",
                )}
              >
                {label}
                {done && <span className="sr-only">（済み）</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {info && (
        <div className="mt-7">
          <p className="font-mincho text-xl text-ink-900">{info.label}</p>
          <p className="mt-1.5 text-sm leading-7 text-ink-700">{info.note}</p>
        </div>
      )}
    </div>
  );
}
