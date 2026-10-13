import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEYLEN = 64;

/** "scrypt$<salt base64>$<hash base64>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64"),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** ログインIDは英数字・記号（. _ - @ +）で 4〜64 文字。メールアドレスも可 */
export function normalizeLoginId(raw: string): string | null {
  const id = raw.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9._\-@+]{4,64}$/.test(id) ? id : null;
}

/** パスワードは 8 文字以上 */
export const MIN_PASSWORD = 8;

let dummyHash: Promise<string> | null = null;

/**
 * 存在しないログインIDでも、本物と同じだけ scrypt の計算をする（応答時間の差から ID の有無を推測させない）。
 * 結果は常に false。
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword("devote-dummy-password");
  await verifyPassword(password, await dummyHash);
  return false;
}
