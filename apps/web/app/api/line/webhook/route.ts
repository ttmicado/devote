import { getDb, userChannels, verificationTokens } from "@devote/db";
import { replyLine, verifyLineSignature } from "@devote/services";
import { and, eq, gt, isNull } from "drizzle-orm";
import { appUrl } from "@/lib/session";

export const runtime = "nodejs";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

/**
 * LINE 公式アカウントの Webhook。
 * - 友だち追加: 連携方法を案内
 * - 6桁コード: Web の設定画面で発行したコードと照合して通知先として登録
 * - ブロック: 通知先を無効化
 * 返信は reply API を使う（無料通数を消費しない）。
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyLineSignature(raw, req.headers.get("x-line-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const { events } = JSON.parse(raw) as { events: LineEvent[] };
  const db = getDb();

  for (const ev of events) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;

    if (ev.type === "unfollow") {
      await db
        .update(userChannels)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(userChannels.channel, "line"), eq(userChannels.address, lineUserId)));
      continue;
    }

    if (ev.type === "follow" && ev.replyToken) {
      await replyLine(ev.replyToken, [
        {
          type: "text",
          text: `友だち追加ありがとうございます！\nDevote の設定画面（${appUrl()}/settings）で表示される6桁の連携コードをこのトークに送ってください。条件に合う新着物件をここでお知らせします。`,
        },
      ]);
      continue;
    }

    if (ev.type === "message" && ev.message?.type === "text" && ev.replyToken) {
      const code = ev.message.text?.trim().replace(/\s/g, "") ?? "";
      if (!/^\d{6}$/.test(code)) {
        await replyLine(ev.replyToken, [
          {
            type: "text",
            text: `ご連絡ありがとうございます。条件の相談はこちらからどうぞ: ${appUrl()}/chat\n内見のご希望は各物件ページの「内見を問い合わせる」からお送りください。`,
          },
        ]);
        continue;
      }
      const [token] = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, `line:${code}`),
            eq(verificationTokens.purpose, "line_link"),
            isNull(verificationTokens.usedAt),
            gt(verificationTokens.expiresAt, new Date()),
          ),
        );
      if (!token) {
        await replyLine(ev.replyToken, [
          {
            type: "text",
            text: "連携コードが見つからないか、有効期限（30分）が切れています。設定画面で新しいコードを発行してください。",
          },
        ]);
        continue;
      }
      await db
        .insert(userChannels)
        .values({ userId: token.userId, channel: "line", address: lineUserId, priority: 0 })
        .onConflictDoUpdate({
          target: [userChannels.channel, userChannels.address],
          set: { userId: token.userId, active: true, updatedAt: new Date() },
        });
      await db
        .update(verificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(verificationTokens.token, token.token));
      await replyLine(ev.replyToken, [
        {
          type: "text",
          text: "LINE連携が完了しました🎉 条件に合う物件が見つかり次第、ここでお知らせします。",
        },
      ]);
    }
  }
  return Response.json({ ok: true });
}
