import { getDb, userChannels, verificationTokens } from "@devote/db";
import { replyLine, verifyLineSignature } from "@devote/services";
import { and, eq, gt, isNull } from "drizzle-orm";
import { SECURITY_COPY } from "@/lib/copy";
import { hit } from "@/lib/rate-limit";
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
    try {
      await handleEvent(ev, db);
    } catch (e) {
      console.error(
        `[line] ${ev.type} の処理に失敗: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return Response.json({ ok: true });
}

async function handleEvent(ev: LineEvent, db: ReturnType<typeof getDb>) {
  {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) return;

    if (ev.type === "unfollow") {
      await db
        .update(userChannels)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(userChannels.channel, "line"), eq(userChannels.address, lineUserId)));
      return;
    }

    if (ev.type === "follow" && ev.replyToken) {
      await replyLine(ev.replyToken, [
        {
          type: "text",
          text: `Devote のコンシェルジュです。ご登録ありがとうございます。\nお届け設定（${appUrl()}/settings）に表示される6桁の連携コードを、このトークにお送りください。ご希望に適う物件を、ここでお届けします。`,
        },
      ]);
      return;
    }

    if (ev.type === "message" && ev.message?.type === "text" && ev.replyToken) {
      const code = ev.message.text?.trim().replace(/\s/g, "") ?? "";
      if (!/^\d{6}$/.test(code)) {
        await replyLine(ev.replyToken, [
          {
            type: "text",
            text: `ご連絡ありがとうございます。ご希望の見直しは、こちらのコンシェルジュが承ります。\n${appUrl()}/chat\n内見は、お届けした物件のページからご依頼いただけます。`,
          },
        ]);
        return;
      }
      // 6桁コードの総当たりを防ぐ（LINE ユーザーごとに1時間5回まで）
      if (!(await hit(`line-code:${lineUserId}`, 5, 3600))) {
        await replyLine(ev.replyToken, [{ type: "text", text: SECURITY_COPY.rateLimit.lineCode }]);
        return;
      }
      // 同じコードが同時に届いても1回だけ通るよう、「未使用かつ期限内」を条件に使用済みにする
      const [token] = await db
        .update(verificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(verificationTokens.token, `line:${code}`),
            eq(verificationTokens.purpose, "line_link"),
            isNull(verificationTokens.usedAt),
            gt(verificationTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!token) {
        await replyLine(ev.replyToken, [
          {
            type: "text",
            text: "連携コードの有効期限（30分）が切れているようです。お手数ですが、お届け設定で新しいコードを発行してください。",
          },
        ]);
        return;
      }
      const [existing] = await db
        .select()
        .from(userChannels)
        .where(and(eq(userChannels.channel, "line"), eq(userChannels.address, lineUserId)));
      if (existing) {
        // 別のアカウントで有効に使われている連携は奪わない（無効化済みなら引き継ぐ）
        if (existing.userId !== token.userId && existing.active) {
          await replyLine(ev.replyToken, [{ type: "text", text: SECURITY_COPY.lineLink.taken }]);
          return;
        }
        await db
          .update(userChannels)
          .set({ userId: token.userId, active: true, updatedAt: new Date() })
          .where(eq(userChannels.id, existing.id));
      } else {
        await db
          .insert(userChannels)
          .values({ userId: token.userId, channel: "line", address: lineUserId, priority: 0 })
          .onConflictDoNothing();
      }
      await replyLine(ev.replyToken, [
        {
          type: "text",
          text: "LINE と連携しました。ご希望に適う物件が見つかり次第、ここでお届けします。",
        },
      ]);
    }
  }
}
