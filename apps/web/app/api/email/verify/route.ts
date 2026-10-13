export const runtime = "nodejs";

/**
 * 確認メールのリンク。メールのリンク先読み込み（セキュリティ製品のスキャナー等）で
 * 勝手に確定しないよう、GET では確定せず確認画面（ボタンを押して POST）へ送る。
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return new Response(null, {
    status: 307,
    headers: {
      location: `/email/verify?token=${encodeURIComponent(token)}`,
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}
