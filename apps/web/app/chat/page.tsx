import { emptyCondition, loadChat, toDisplay } from "@/lib/ai";
import { currentUserId } from "@/lib/session";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

/** 依頼書に添える日付（日本時間）: "2026.10.13" */
function todayInTokyo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const userId = await currentUserId();
  const chat = userId ? await loadChat(userId) : null;
  return (
    <ChatClient
      initialMessages={chat ? toDisplay(chat.rows) : []}
      initialDraft={chat?.state.draft ?? emptyCondition()}
      initialPhase={chat?.state.phase ?? "exploring"}
      date={todayInTokyo()}
      confirmFailed={error === "condition"}
    />
  );
}
