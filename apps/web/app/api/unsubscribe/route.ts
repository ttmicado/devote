import { getDb, userChannels } from "@devote/db";
import { verifyUnsubscribeToken } from "@devote/services";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * メールの配信停止（List-Unsubscribe / RFC 8058 のワンクリック）。
 * - POST: メールソフトのワンクリック、または確認画面のボタン。そのユーザーのメールのチャネルを止めて 200
 * - GET: 確認画面（ボタンを押すと POST）。リンクを開いただけでは停止しない（プリフェッチ対策）
 * トークンは notify/unsubscribe-token.ts（SESSION_SECRET で署名、用途 "unsub"）。
 * 文言は画面がこの1枚だけのため、ここにまとめている（トーンは apps/web/lib/copy.ts に合わせる）。
 */
const TEXT = {
  title: "メールでのお届けの停止",
  confirm: "Devote からのメールでのお届けを停止します。よろしければ、下のボタンを押してください。",
  button: "メールでのお届けを停止する",
  done: "メールでのお届けを停止しました。LINE でのお届けや、ご希望の条件はそのまま残っています。再開はお届け設定から承ります。",
  invalid:
    "リンクの有効期限が切れているか、正しくありません。お手数ですが、お届け設定から変更してください。",
  settings: "お届け設定へ",
};

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

function page(body: string, status = 200) {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${TEXT.title} | Devote</title></head>
<body style="margin:0;background:#f7efe2;color:#26221e;font-family:'Hiragino Sans','Yu Gothic',sans-serif">
<main style="max-width:520px;margin:0 auto;padding:64px 24px;line-height:1.9">
<div style="font:300 28px/1 Georgia,'Times New Roman',serif;color:#142821">Devote</div>
<h1 style="font:500 20px/1.6 'Hiragino Mincho ProN','Yu Mincho',serif;color:#142821;margin:32px 0 12px">${TEXT.title}</h1>
${body}
<p style="margin-top:32px;font-size:13px"><a href="/settings" style="color:#1b3a2e">${TEXT.settings}</a></p>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

const tokenOf = (req: Request) => new URL(req.url).searchParams.get("t") ?? "";

export async function GET(req: Request) {
  const t = tokenOf(req);
  if (!verifyUnsubscribeToken(t)) return page(`<p>${TEXT.invalid}</p>`, 400);
  return page(`<p>${TEXT.confirm}</p>
<form method="post" action="/api/unsubscribe?t=${encodeURIComponent(t)}">
<button type="submit" style="margin-top:16px;padding:12px 28px;border:0;border-radius:999px;background:#1b3a2e;color:#f7efe2;font-size:13px;letter-spacing:.1em;cursor:pointer">${escapeHtml(TEXT.button)}</button>
</form>`);
}

export async function POST(req: Request) {
  const userId = verifyUnsubscribeToken(tokenOf(req));
  if (!userId) return page(`<p>${TEXT.invalid}</p>`, 400);
  await getDb()
    .update(userChannels)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(userChannels.userId, userId), eq(userChannels.channel, "email")));
  return page(`<p>${TEXT.done}</p>`);
}
