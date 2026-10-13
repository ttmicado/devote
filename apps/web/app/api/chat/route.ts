import Anthropic from "@anthropic-ai/sdk";
import { loadChat, runChatTurn, toDisplay } from "@/lib/ai";
import { ensureUserId } from "@/lib/session";

export const runtime = "nodejs";
// 条件の相談はツール呼び出しを含めて数十秒かかることがある
export const maxDuration = 120;

export async function POST(req: Request) {
  const { message } = (await req.json()) as { message?: string };
  const text = message?.trim();
  if (!text) return Response.json({ error: "message is required" }, { status: 400 });
  if (text.length > 2000)
    return Response.json({ error: "メッセージが長すぎます" }, { status: 400 });

  const userId = await ensureUserId();
  try {
    const state = await runChatTurn(userId, text);
    const { rows } = await loadChat(userId);
    return Response.json({ messages: toDisplay(rows), draft: state.draft, phase: state.phase });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "混み合っています。少し待ってからもう一度お試しください。" },
        { status: 429 },
      );
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      return Response.json({ error: "AIとの通信でエラーが発生しました。" }, { status: 502 });
    }
    throw e;
  }
}
