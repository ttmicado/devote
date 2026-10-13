import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

/**
 * Neon の pooled 接続（PgBouncer トランザクションモード）でも動くよう prepare: false。
 * サーバーレス（Vercel）では呼び出しごとに作らず、getDb() のシングルトンを使う。
 */
export function createDb(url = process.env.DATABASE_URL, opts: { max?: number } = {}) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: opts.max ?? 5, onnotice: () => undefined });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __devoteDb?: Db };

export function getDb(): Db {
  globalForDb.__devoteDb ??= createDb(process.env.DATABASE_URL, { max: 3 });
  return globalForDb.__devoteDb;
}
