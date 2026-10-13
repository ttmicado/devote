import { emptyCondition, loadChat, toDisplay } from "@/lib/ai";
import { currentUserId } from "@/lib/session";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const userId = await currentUserId();
  const chat = userId ? await loadChat(userId) : null;
  return (
    <ChatClient
      initialMessages={chat ? toDisplay(chat.rows) : []}
      initialDraft={chat?.state.draft ?? emptyCondition()}
      initialPhase={chat?.state.phase ?? "exploring"}
    />
  );
}
