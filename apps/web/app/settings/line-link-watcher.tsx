"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 連携コードを表示している間、LINE 側で連携が済んだかを数秒おきに確かめ、
 * 済んだら画面を「連携しました」に切り替える（コードを送った後に何も起きないように見えないように）。
 */
export function LineLinkWatcher() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 30 * 60_000) {
        clearInterval(timer);
        setWaiting(false);
        return;
      }
      const res = await fetch("/api/me/channels", { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as { line?: boolean } | null;
      if (json?.line) {
        clearInterval(timer);
        router.replace("/settings?linked=1");
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [router]);
  if (!waiting) return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-xs text-sand-300" aria-live="polite">
      <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-sand-300" />
      トークへの送信をお待ちしています。届くと、この画面が自動で切り替わります。
    </p>
  );
}
