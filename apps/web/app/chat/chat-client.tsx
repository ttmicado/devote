"use client";

import type { SearchCondition, SearchPhase } from "@devote/core";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ConditionBrief } from "@/components/condition-summary";
import { Button, Eyebrow } from "@/components/ui";
import { CHAT } from "@/lib/copy";
import { confirmCondition } from "../actions";
import { BriefBar } from "./brief-bar";
import { AssistantLine, StarterChips, ThinkingLine, UserLine } from "./messages";

type Msg = { role: "user" | "assistant"; text: string };

/**
 * コンシェルジュとの対話画面。
 * - デスクトップ: 左に対話、右に「承ったご希望」（依頼書）と確定ボタン
 * - スマホ: 対話が主役。上部に依頼書の折りたたみバー、条件がそろったら入力欄の上に確定ボタン
 * 高さは 100dvh 基準（固定ヘッダー 76px を除いた残りを対話に使う）。
 */
export function ChatClient({
  initialMessages,
  initialDraft,
  initialPhase,
  date,
  confirmFailed = false,
}: {
  initialMessages: Msg[];
  initialDraft: SearchCondition;
  initialPhase: SearchPhase;
  date: string;
  confirmFailed?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState(initialDraft);
  const [phase, setPhase] = useState(initialPhase);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(confirmFailed ? CHAT.confirmError : null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [confirming, startConfirm] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstScroll = useRef(true);

  // 新しい発言が増えたら対話ログの末尾へ（ページ全体はスクロールさせない）
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstScroll.current ? "auto" : "smooth" });
    firstScroll.current = false;
  }, [messages.length, sending]);

  // 入力欄は内容に合わせて最大5行まで伸ばす
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  useEffect(() => {
    if (!briefOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBriefOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefOpen]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setError(null);
    setSending(true);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? CHAT.error);
      setMessages(json.messages);
      setDraft(json.draft);
      setPhase(json.phase);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : CHAT.error);
      // 送れなかった文面は入力欄に戻す
      setInput((cur) => cur || text);
    } finally {
      setSending(false);
    }
  }

  const hasArea = draft.areas.cities.length + draft.areas.stations.length > 0;
  // 確定できる最低限（エリアか予算のどちらか）
  const canConfirm = hasArea || draft.hard.maxPrice != null;
  // スマホで確定ボタンを常時出すのは、エリアと予算の両方が伺えてから
  const ready = hasArea && draft.hard.maxPrice != null;

  const confirm = () =>
    startConfirm(async () => {
      await confirmCondition();
    });

  const confirmButton = (className?: string) => (
    <Button
      size="lg"
      arrow={!confirming}
      disabled={!canConfirm || confirming}
      onClick={confirm}
      className={`w-full ${className ?? ""}`}
    >
      {confirming ? CHAT.confirming : CHAT.confirm}
    </Button>
  );

  return (
    <main className="flex h-dvh flex-col pt-[76px]">
      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-10 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* 対話 */}
        <section
          aria-labelledby="chat-title"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <BriefBar
            condition={draft}
            open={briefOpen}
            onToggle={() => setBriefOpen((o) => !o)}
            controls="brief-panel"
          />

          <header className="hidden border-b border-ink-900/15 pt-10 pb-6 lg:block lg:pr-14">
            <Eyebrow rule>{CHAT.eyebrow}</Eyebrow>
            <h1
              id="chat-title"
              className="display mt-4 font-mincho text-[2.2rem] text-evergreen-900"
            >
              {CHAT.title}
            </h1>
          </header>
          <h1 className="sr-only lg:hidden">{CHAT.title}</h1>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="コンシェルジュとの対話"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-8 pb-6 [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)] sm:px-10 lg:pr-14 lg:pl-0"
          >
            <ol className="mx-auto max-w-[44rem] space-y-8 lg:mx-0">
              {/* 最初の挨拶は保存しない固定の文面。会話が始まっても先頭に残す */}
              <AssistantLine text={CHAT.greeting} className="animate-rise" />
              {messages.map((m, i) =>
                m.role === "assistant" ? (
                  <AssistantLine key={`${i}-a`} text={m.text} />
                ) : (
                  <UserLine key={`${i}-u`} text={m.text} />
                ),
              )}
              {sending && <ThinkingLine />}
            </ol>
            {messages.length === 0 && !sending && (
              <StarterChips className="mx-auto mt-8 max-w-[44rem] lg:mx-0" onPick={send} />
            )}
          </div>

          <div aria-live="assertive" className="px-5 sm:px-10 lg:px-0 lg:pr-14">
            {error && (
              <p className="mb-3 border-l-2 border-signal pl-4 text-[13px] leading-6 text-signal">
                {error}
              </p>
            )}
          </div>

          {ready && (
            <div className="border-t border-ink-900/15 px-5 pt-3 sm:px-10 lg:hidden">
              {confirmButton("min-h-12")}
            </div>
          )}

          <form
            className="flex items-end gap-3 border-t border-ink-900/15 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-colors duration-500 focus-within:border-evergreen-700 sm:px-10 lg:mr-14 lg:px-0 lg:pt-4 lg:pb-8"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              {CHAT.placeholder}
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // パソコンでは Enter で送る（Shift+Enter で改行）。タッチ端末では改行のまま
                const coarse = window.matchMedia("(pointer: coarse)").matches;
                if (!coarse && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              enterKeyHint="send"
              placeholder={CHAT.placeholder}
              className="min-h-11 flex-1 resize-none bg-transparent py-2 text-base leading-7 text-ink-900 placeholder:text-ink-300 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="group mb-0.5 inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-full bg-evergreen-800 text-sand-50 transition-colors duration-500 ease-[var(--ease-luxe)] hover:bg-evergreen-900 disabled:bg-ink-900/15 disabled:text-ink-500 sm:w-auto sm:px-6"
            >
              <span className="sr-only text-[13px] tracking-[0.12em] sm:not-sr-only">
                {CHAT.send}
              </span>
              <span
                aria-hidden
                className="transition-transform duration-500 group-hover:translate-x-0.5"
              >
                →
              </span>
            </button>
          </form>

          {/* スマホ: 依頼書の展開パネル */}
          {briefOpen && (
            <div
              id="brief-panel"
              className="absolute inset-x-0 top-16 bottom-0 z-20 overflow-y-auto overscroll-contain border-t border-ink-900/15 bg-sand-50 px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 lg:hidden"
            >
              <ConditionBrief condition={draft} phase={phase} date={date} />
              <div className="mt-6 space-y-3">
                {confirmButton()}
                <Button variant="outline" onClick={() => setBriefOpen(false)} className="w-full">
                  {CHAT.briefClose}
                </Button>
              </div>
              <p className="mt-5 text-[12px] leading-6 text-ink-500">{CHAT.confirmNote}</p>
            </div>
          )}
        </section>

        {/* デスクトップ: 承ったご希望（依頼書） */}
        <aside
          aria-label={CHAT.briefTitle}
          className="hidden min-h-0 flex-col border-l border-ink-900/10 pl-12 lg:flex"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-10 pb-10 [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]">
            <ConditionBrief condition={draft} phase={phase} date={date} />
          </div>
          <div className="shrink-0 border-t border-ink-900/15 pt-5 pb-8">
            {confirmButton()}
            <p className="mt-3 text-[12px] leading-6 text-ink-500">{CHAT.confirmNote}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
