"use client";

import type { SearchCondition, SearchPhase } from "@devote/core";
import { useEffect, useRef, useState, useTransition } from "react";
import { ConditionSummary, PHASE_LABELS } from "@/components/condition-summary";
import { confirmCondition } from "../actions";

type Msg = { role: "user" | "assistant"; text: string };

const STARTERS = [
  "港区で2LDKの賃貸を探しています。予算は30万円くらいです",
  "豊洲か勝どきでファミリー向けのマンションを買いたい",
  "渋谷に通勤しやすい1LDKを探しています",
];

export function ChatClient({
  initialMessages,
  initialDraft,
  initialPhase,
}: {
  initialMessages: Msg[];
  initialDraft: SearchCondition;
  initialPhase: SearchPhase;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState(initialDraft);
  const [phase, setPhase] = useState(initialPhase);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, startConfirm] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "エラーが発生しました");
      setMessages(json.messages);
      setDraft(json.draft);
      setPhase(json.phase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const hasCondition =
    draft.areas.cities.length + draft.areas.stations.length > 0 || draft.hard.maxPrice != null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="flex h-[calc(100vh-11rem)] flex-col rounded-xl border border-stone-200 bg-white">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">
                こんにちは、Devote の住まい探しコンシェルジュです。どんなお住まいをお探しですか？
                気になっていることを、思いつくままにお話しください。
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-brand-600 px-3 py-1.5 text-left text-xs text-brand-700 hover:bg-brand-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={`${i}-${m.role}`} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-brand-700 text-white" : "bg-stone-100"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          {sending && <p className="animate-pulse text-sm text-stone-500">担当者が考えています…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div ref={bottom} />
        </div>
        <form
          className="flex gap-2 border-t border-stone-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="例: 六本木か麻布十番で、ペット可の1LDKを探しています"
            className="flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-lg bg-brand-700 px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            送信
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-bold">いまの希望条件</h2>
          {hasCondition ? (
            <ConditionSummary condition={draft} />
          ) : (
            <p className="text-sm text-stone-500">会話の内容から自動でまとめます。</p>
          )}
          <p className="mt-3 text-xs text-stone-500">
            検討段階: <span className="font-bold text-stone-700">{PHASE_LABELS[phase].label}</span>
          </p>
        </div>
        <button
          type="button"
          disabled={!hasCondition || confirming}
          onClick={() => startConfirm(() => confirmCondition())}
          className="w-full rounded-xl bg-brand-700 px-4 py-3 font-bold text-white shadow disabled:opacity-40"
        >
          {confirming ? "保存しています…" : "この条件で通知を受け取る"}
        </button>
        <p className="text-xs text-stone-500">
          確定後も、いつでもこの画面で条件を見直せます。通知の頻度と受け取り方法は「通知設定」で選べます。
        </p>
      </aside>
    </div>
  );
}
