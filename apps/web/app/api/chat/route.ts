import Anthropic from "@anthropic-ai/sdk";
import { draftPreview, loadChat, runChatTurn, toDisplay } from "@/lib/ai";
import { ensureUserId } from "@/lib/session";

export const runtime = "nodejs";
// 条件の相談はツール呼び出しを含めて数十秒かかることがある
export const maxDuration = 120;

const UNAVAILABLE =
  "ただいまコンシェルジュの準備が整っていません。少し時間をおいて、もう一度お試しください。";

/** 本番で原因を追えるよう、設定不足を区別してログに残す（利用者には詳細を見せない） */
function classify(e: unknown): { status: number; error: string; log: string } {
  if (e instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      error: "混み合っています。少し待ってからもう一度お試しください。",
      log: "rate_limit",
    };
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return { status: 503, error: UNAVAILABLE, log: "anthropic_auth: ANTHROPIC_API_KEY が無効です" };
  }
  if (e instanceof Anthropic.APIError) {
    return {
      status: 502,
      error: "AIとの通信でエラーが発生しました。",
      log: `anthropic_api ${e.status}: ${e.message}`,
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code;
  if (
    e instanceof Anthropic.AnthropicError ||
    /ANTHROPIC_API_KEY|authentication method/i.test(msg)
  ) {
    return { status: 503, error: UNAVAILABLE, log: `anthropic_config: ${msg}` };
  }
  if (/SESSION_SECRET/.test(msg)) {
    return { status: 503, error: UNAVAILABLE, log: `session_config: ${msg}` };
  }
  if (code === "42P01") {
    return {
      status: 503,
      error: UNAVAILABLE,
      log: `db_schema: テーブルがありません（マイグレーション未実行）: ${msg}`,
    };
  }
  return {
    status: 500,
    error: "エラーが発生しました。もう一度お試しください。",
    log: `unexpected: ${msg}`,
  };
}

export async function POST(req: Request) {
  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  const text = message?.trim();
  if (!text) return Response.json({ error: "メッセージを入力してください。" }, { status: 400 });
  if (text.length > 2000) {
    return Response.json({ error: "メッセージが長すぎます" }, { status: 400 });
  }

  try {
    const userId = await ensureUserId();
    const state = await runChatTurn(userId, text);
    const { rows } = await loadChat(userId);
    const preview = await draftPreview(state.draft);
    return Response.json({
      messages: toDisplay(rows),
      draft: state.draft,
      phase: state.phase,
      preview,
    });
  } catch (e) {
    const c = classify(e);
    console.error(`[chat] ${c.log}`);
    return Response.json({ error: c.error }, { status: c.status });
  }
}
