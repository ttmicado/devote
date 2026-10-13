import { getDb, users } from "@devote/db";
import { verifyUserLink } from "@devote/services";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

/**
 * 通知（LINE / メール）のリンクから開いたときに、本人のセッションを引き継ぐ。
 * LINE のアプリ内ブラウザは通常のブラウザと Cookie を共有しないため。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/matches";
  // オープンリダイレクトを防ぐ（同じサイト内のパスだけ）
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/matches";
  const userId = verifyUserLink(url.searchParams.get("t") ?? "");
  if (userId) {
    const [u] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (u) await setSessionCookie(u.id);
  }
  redirect(safeNext);
}
