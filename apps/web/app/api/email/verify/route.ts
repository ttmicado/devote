import { getDb, userChannels, verificationTokens } from "@devote/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const db = getDb();
  const [t] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.purpose, "email_verify"),
        isNull(verificationTokens.usedAt),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    );
  if (!t?.payload) redirect("/settings?email=expired");
  await db
    .insert(userChannels)
    .values({ userId: t.userId, channel: "email", address: t.payload, priority: 10 })
    .onConflictDoUpdate({
      target: [userChannels.channel, userChannels.address],
      set: { userId: t.userId, active: true, updatedAt: new Date() },
    });
  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.token, token));
  redirect("/settings?email=verified");
}
