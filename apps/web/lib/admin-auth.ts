import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

/** 長さの違いも漏らさないよう、ハッシュしてから定数時間で比較する */
function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/**
 * Authorization ヘッダー（Basic 認証）が ADMIN_USER / ADMIN_PASSWORD と一致するか。
 * 不正な base64 などは例外にせず false を返す。
 */
export function isAdminAuthorization(header: string | null | undefined): boolean {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass || !header) return false;
  const [scheme, encoded] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  // 両方とも必ず比較して、どちらで失敗したかを時間差で漏らさない
  const okUser = safeEqual(decoded.slice(0, i), user);
  const okPass = safeEqual(decoded.slice(i + 1), pass);
  return okUser && okPass;
}

/**
 * 管理画面の Server Action の先頭で呼ぶ。
 * Server Action は任意のパスに POST できるため、proxy.ts の /admin 配下の認証だけには頼らない。
 */
export async function assertAdmin(): Promise<void> {
  const h = await headers();
  if (!isAdminAuthorization(h.get("authorization"))) {
    throw new Error("管理者の認証が必要です");
  }
}
