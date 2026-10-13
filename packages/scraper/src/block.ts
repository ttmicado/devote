/**
 * ブロック・チャレンジページ（WAF / bot 対策 / 海外IP制限）の検知。
 *
 * これらのページは HTTP 200 で返ることがあり、パーサにそのまま渡すと「一覧0件」として
 * 黙って処理されてしまう。ランナーとアダプターはこの関数で判定し、警告またはエラーにする。
 * 通常の物件ページで誤検知しないよう、パターンは WAF 製品固有の文言に限る
 * （reCAPTCHA 等は問い合わせフォームにも載るため、本文が小さいときだけ見る）。
 */
const STATUS_REASONS: Record<number, string> = {
  401: "HTTP 401（認証が必要）",
  403: "HTTP 403（アクセス拒否）",
  407: "HTTP 407（プロキシ認証）",
  429: "HTTP 429（リクエスト過多）",
  451: "HTTP 451（法的理由で拒否）",
  503: "HTTP 503（混雑・メンテナンス・チャレンジ）",
};

const BODY_PATTERNS: [RegExp, string][] = [
  [
    /<title>\s*Just a moment\.\.\.\s*<\/title>|cf-browser-verification|\/cdn-cgi\/challenge-platform\//i,
    "Cloudflare のチャレンジ",
  ],
  [/Attention Required! \| Cloudflare|cf-error-details/i, "Cloudflare のブロック"],
  [/Incapsula incident|_Incapsula_Resource/i, "Imperva (Incapsula) のブロック"],
  [/captcha-delivery\.com|geo\.captcha-delivery/i, "DataDome のチャレンジ"],
  [/px-captcha|_pxCaptcha/i, "PerimeterX のチャレンジ"],
  [/awswaf|aws-waf-token|challenge\.js\?.*awswaf/i, "AWS WAF のチャレンジ"],
  [/The request could not be satisfied[\s\S]{0,400}CloudFront/i, "CloudFront のブロック"],
  [
    /<title>\s*Access Denied\s*<\/title>[\s\S]{0,2000}(?:Reference\s*#|don't have permission)/i,
    "Akamai 等のアクセス拒否",
  ],
  [/海外からのアクセス|日本国外からの(?:アクセス|ご利用)|国外からのアクセス/, "海外IPの制限"],
  [
    /不正なアクセス(?:が|を)検知|アクセスが制限されています|アクセスを制限しております/,
    "アクセス制限",
  ],
];

/** 本文が小さいときだけ見るパターン（通常ページにも出うるもの） */
const SMALL_BODY_PATTERNS: [RegExp, string][] = [
  [/g-recaptcha|h-captcha|hcaptcha\.com|turnstile/i, "CAPTCHA"],
  [
    /<title>\s*(?:403 Forbidden|Forbidden|Access Denied|Request Rejected)\s*<\/title>/i,
    "アクセス拒否ページ",
  ],
];
const SMALL_BODY_BYTES = 20_000;

/** ブロック・チャレンジページらしければ理由を、そうでなければ null を返す */
export function detectBlockPage(body: string, status?: number): string | null {
  if (status != null && STATUS_REASONS[status]) return STATUS_REASONS[status];
  for (const [re, reason] of BODY_PATTERNS) if (re.test(body)) return reason;
  if (body.length < SMALL_BODY_BYTES) {
    for (const [re, reason] of SMALL_BODY_PATTERNS) if (re.test(body)) return reason;
  }
  return null;
}

/** ログ用: 本文の <title> または先頭（空白を詰めて最大120字） */
export function describeBody(body: string): string {
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const s = (title ?? body).replace(/\s+/g, " ").trim();
  return `${s.slice(0, 120)}${s.length > 120 ? "…" : ""}（${body.length}バイト）`;
}
