import { getDb, users } from "@devote/db";
import { verifyUserLink } from "@devote/services";
import { eq } from "drizzle-orm";
import { safePath } from "@/lib/safe-path";
import { currentUserId, setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

/** トークン入りの URL を Referer やキャッシュに残さないリダイレクト */
function go(location: string) {
  return new Response(null, {
    status: 307,
    headers: {
      location,
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}

/**
 * 通知（LINE / メール）のリンクから開いたときに、本人のセッションを引き継ぐ。
 * LINE のアプリ内ブラウザは通常のブラウザと Cookie を共有しないため。
 * - パスワードを設定済みのアカウントは、リンクだけではログインさせない（ログイン画面へ）
 * - この端末で別のアカウントを使っている場合は、黙って上書きせず確認画面へ
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safePath(url.searchParams.get("next"));
  const t = url.searchParams.get("t") ?? "";
  const userId = verifyUserLink(t);
  if (!userId) return go(next);
  const [target] = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!target) return go(next);

  const current = await currentUserId();
  if (current === target.id) return go(next);
  if (target.passwordHash) return go(`/login?next=${encodeURIComponent(next)}`);
  if (current) {
    return go(`/session/switch?t=${encodeURIComponent(t)}&next=${encodeURIComponent(next)}`);
  }
  await setSessionCookie(target.id, target.sessionVersion);
  return go(next);
}
