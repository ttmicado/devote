import { join } from "node:path";
import { type CrawlScope, crawlScopes } from "@devote/core";
import { crawlRuns, type Db, listings } from "@devote/db";
import {
  type BrowserFetchContext,
  type CrawlResult,
  crawlSource,
  createBrowserFetchContext,
  createHttpFetcher,
  type FetchContext,
  type SiteAdapter,
} from "@devote/scraper";
import { activeConditions } from "@devote/services";
import { and, desc, eq, isNotNull, lt, max } from "drizzle-orm";
import { ingestCrawl } from "./ingest.js";
import { loginHoldReason } from "./login-hold.js";
import { budgetForRun, isWithinActiveHours, jstCalendar, recordUsage } from "./quota.js";

/**
 * 巡回結果のうちログに出す件数。
 * - seen: 一覧で見えた物件数
 * - unchanged: 一覧の主要値（listHash）が前回と同じで詳細取得を省略した物件数
 * - detailRequests: 詳細の取得を試みた件数（= fetched + errors）
 * - deferred: 件数上限で次回に回した物件数
 */
export function summarizeCrawl(result: CrawlResult) {
  return {
    seen: result.seenIds.length,
    unchanged: result.seenIds.length - result.detailRequests - result.deferred,
    detailRequests: result.detailRequests,
    fetched: result.listings.length,
    deferred: result.deferred,
    listCompleted: result.listCompleted,
  };
}

/** 1ソースを巡回して DB に反映し、crawl_runs に結果を残す */
const MAX_DETAILS = Number(process.env.DEVOTE_MAX_DETAILS_PER_SOURCE ?? 300);
/** 1ソースに使ってよい時間（分）。初回の取り込みが重いソースが1本で巡回全体の時間を使い切らないように */
const SOURCE_MAX_MINUTES = Number(process.env.DEVOTE_SOURCE_MAX_MINUTES ?? 15);
/** 締め切りのあと、取得済みの分を DB に取り込むために残す時間（分） */
const INGEST_MARGIN_MINUTES = 3;

/**
 * 1ソースの締め切り（epoch ms）。バッチ全体の締め切りから取り込みの余裕を引いた時刻と、
 * 開始からソースごとの上限時間のうち早い方
 */
export function sourceDeadline(
  startedAt: number,
  batchDeadline: number | undefined,
  maxMinutes = SOURCE_MAX_MINUTES,
): number {
  const own = startedAt + maxMinutes * 60_000;
  return batchDeadline == null
    ? own
    : Math.min(own, batchDeadline - INGEST_MARGIN_MINUTES * 60_000);
}

/** 有効な希望条件から作った会員サイトの検索範囲（crawlScopes）。1回のバッチで1度だけ読む */
export async function loadCrawlScopes(db: Db): Promise<CrawlScope[]> {
  return crawlScopes((await activeConditions(db)).map((c) => c.condition));
}

/**
 * ジョブの制限時間で強制終了され「running」のまま残った巡回の記録を、失敗として閉じる。
 * 何度実行しても同じ結果になる
 */
export async function closeStaleRuns(db: Db, olderThanMinutes = 70): Promise<number> {
  const rows = await db
    .update(crawlRuns)
    .set({
      status: "failed",
      error: "打ち切り（ジョブの制限時間で強制終了された）",
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(crawlRuns.status, "running"),
        lt(crawlRuns.startedAt, new Date(Date.now() - olderThanMinutes * 60_000)),
      ),
    )
    .returning({ id: crawlRuns.id });
  return rows.length;
}

/** ソースごとの最後に成功した巡回の開始時刻（巡回の順番を決めるのに使う） */
export async function lastSucceededAt(db: Db): Promise<Map<string, Date>> {
  const rows = await db
    .select({ source: crawlRuns.source, at: max(crawlRuns.startedAt) })
    .from(crawlRuns)
    .where(eq(crawlRuns.status, "succeeded"))
    .groupBy(crawlRuns.source);
  return new Map(rows.flatMap((r) => (r.at ? [[r.source, r.at] as const] : [])));
}

/**
 * 巡回の順番。会員サイト（ログインあり。提供時間・利用枠がある）を先に、残りは最後に成功してから
 * 長いソース（未成功を含む）から。時間切れで後ろのソースが毎回回れない、ということを防ぐ
 */
export function crawlOrder<T extends { meta: { id: string; requiresLogin: boolean } }>(
  adapters: T[],
  lastSucceeded: Map<string, Date>,
): T[] {
  const at = (a: T) => lastSucceeded.get(a.meta.id)?.getTime() ?? 0;
  return [...adapters].sort(
    (a, b) => Number(b.meta.requiresLogin) - Number(a.meta.requiresLogin) || at(a) - at(b),
  );
}

export async function runSource(
  db: Db,
  adapter: SiteAdapter,
  opts: {
    maxPages?: number;
    maxDetails?: number;
    scopes?: CrawlScope[];
    /** バッチ全体の締め切り（epoch ms）。ジョブの制限時間で強制終了される前に正常に終える */
    deadline?: number;
  } = {},
) {
  const source = adapter.meta.id;
  const now = new Date();
  const skip = (reason: string) => ({ source, ok: true as const, skipped: reason });

  // 提供時間外・前回から間もない・従量課金の枠を使い切った場合は巡回しない
  if (!isWithinActiveHours(adapter.meta.schedule.activeHoursJst, jstCalendar(now).hour)) {
    return skip("提供時間外");
  }
  const [last] = await db
    .select({ startedAt: crawlRuns.startedAt, status: crawlRuns.status, error: crawlRuns.error })
    .from(crawlRuns)
    .where(eq(crawlRuns.source, source))
    .orderBy(desc(crawlRuns.startedAt))
    .limit(1);
  const minInterval = adapter.meta.schedule.minRunIntervalMinutes;
  if (minInterval && last && now.getTime() - last.startedAt.getTime() < minInterval * 60_000) {
    return skip(`前回から${minInterval}分経っていない`);
  }
  // 会員サイトでログインに失敗したら、ロックを避けるため一定時間は試さない（人が確認する）
  const hold = adapter.meta.requiresLogin ? loginHoldReason(last, now) : null;
  if (hold) return skip(hold);
  // 会員サイトは希望条件の範囲だけを検索する。希望条件を持つユーザーがいなければ巡回しない
  let queryContext: { scopes: CrawlScope[] } | undefined;
  if (adapter.meta.scopedByConditions) {
    const scopes = opts.scopes ?? (await loadCrawlScopes(db));
    if (adapter.queries({ scopes }).length === 0) {
      return skip("希望条件の範囲に当てはまる検索がない（有効な希望条件がない）");
    }
    queryContext = { scopes };
  }
  const budget = await budgetForRun(db, adapter.meta, now);
  if (budget.list === 0) return skip("本日分の検索枠を使い切った");

  const [run] = await db.insert(crawlRuns).values({ source, status: "running" }).returning();
  if (!run) throw new Error("crawl_runs insert failed");

  const usesBrowser =
    adapter.meta.fetchMode.list === "browser" || adapter.meta.fetchMode.detail === "browser";
  let browser: BrowserFetchContext | null = null;
  const counters = { list: 0, detail: 0 };
  try {
    let ctx: FetchContext;
    if (usesBrowser) {
      browser = await createBrowserFetchContext(adapter.meta, {
        storageStatePath: join(
          process.env.DEVOTE_STORAGE_DIR ?? join(process.cwd(), "storage"),
          "sessions",
          `${source}.json`,
        ),
      });
      ctx = browser;
    } else {
      ctx = createHttpFetcher(adapter.meta);
    }

    const known = await db
      .select({ id: listings.sourceListingId, hash: listings.listHash })
      .from(listings)
      .where(
        and(
          eq(listings.source, source),
          eq(listings.status, "active"),
          isNotNull(listings.listHash),
        ),
      );
    const result = await crawlSource(adapter, ctx, {
      knownListHashes: new Map(known.map((k) => [k.id, k.hash as string])),
      maxPages: opts.maxPages,
      maxDetails: Math.min(
        opts.maxDetails ?? MAX_DETAILS,
        budget.detail ?? Number.POSITIVE_INFINITY,
      ),
      maxListRequests: budget.list,
      counters,
      queryContext,
      deadline: sourceDeadline(Date.now(), opts.deadline),
      // 従量課金のソースは、取りに行く直前に1件ずつ記録する（強制終了されても記録が漏れない）
      onUsage: adapter.meta.monthlyQuota
        ? (kind) => recordUsage(db, source, { [kind]: 1 })
        : undefined,
    });
    await browser?.saveSession();
    const stats = await ingestCrawl(db, source, result);
    const warnings = [
      ...result.warnings,
      ...stats.warnings,
      ...(result.deferred > 0
        ? [
            `詳細 ${result.deferred} 件は${result.timedOut ? "時間切れ" : "件数上限"}のため次回に取得`,
          ]
        : []),
      ...result.errors.slice(0, 20).map((e) => `${e.item.sourceListingId}: ${e.error}`),
    ];
    await db
      .update(crawlRuns)
      .set({
        status: "succeeded",
        seen: result.seenIds.length,
        fetched: result.listings.length,
        inArea: stats.inArea,
        newCount: stats.newCount,
        updatedCount: stats.updatedCount,
        delistedCount: stats.delistedCount,
        errorCount: result.errors.length + stats.failedCount,
        warnings,
        finishedAt: new Date(),
      })
      .where(eq(crawlRuns.id, run.id));
    // バッチのログ（GitHub Actions）だけで状況が分かるように、一覧の件数・詳細の内訳・警告を出す。
    // inArea / newCount は「今回詳細を取得した物件」の数なので、変化が無い回は 0 になるのが正常
    return {
      source,
      ok: true as const,
      ...summarizeCrawl(result),
      ...stats,
      warnings,
      errors: result.errors.length,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .update(crawlRuns)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(crawlRuns.id, run.id));
    return { source, ok: false as const, error: message };
  } finally {
    await browser?.close();
    // 検索・詳細表示の回数は onUsage で取りに行くたびに記録済み（課金対象のため、失敗・強制終了でも漏らさない）
  }
}
