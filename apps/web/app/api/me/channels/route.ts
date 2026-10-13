import { getDb, userChannels } from "@devote/db";
import { and, eq } from "drizzle-orm";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** お届け設定の画面で、LINE 連携が完了したかを確かめる（連携コードを送った後に自動で表示を切り替える） */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ line: false, email: false });
  const rows = await getDb()
    .select({ channel: userChannels.channel })
    .from(userChannels)
    .where(and(eq(userChannels.userId, userId), eq(userChannels.active, true)));
  return Response.json({
    line: rows.some((r) => r.channel === "line"),
    email: rows.some((r) => r.channel === "email"),
  });
}
