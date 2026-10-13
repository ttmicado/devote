import { ERRORS } from "@/lib/copy";
import { PageShell } from "./page-shell";

/** 読み込み中の枠（見出しと本文の位置だけを静かに示す） */
export function PageLoading({ variant = "list" }: { variant?: "list" | "detail" }) {
  const block = "animate-pulse bg-sand-200/60 motion-reduce:animate-none";
  return (
    <PageShell>
      <div role="status" aria-live="polite" className="border-b border-ink-900/15 pb-8">
        <span className="sr-only">{ERRORS.loading}</span>
        <div className={`h-3 w-28 ${block}`} />
        <div className={`mt-5 h-9 w-2/3 max-w-md ${block}`} />
        <div className={`mt-5 h-4 w-1/2 max-w-sm ${block}`} />
      </div>
      {variant === "detail" ? (
        <div className={`mt-8 aspect-[4/3] w-full sm:aspect-[16/7] ${block}`} />
      ) : (
        <div className="mt-12 grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className={`aspect-[4/3] ${block}`} />
              <div className={`mt-5 h-5 w-3/4 ${block}`} />
              <div className={`mt-4 h-10 w-1/2 ${block}`} />
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
