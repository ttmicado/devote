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
import { and, desc, eq, isNotNull } from "drizzle-orm";
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

/** 有効な希望条件から作った会員サイトの検索範囲（crawlScopes）。1回のバッチで1度だけ読む */
export async function loadCrawlScopes(db: Db): Promise<CrawlScope[]> {
  return crawlScopes((await activeConditions(db)).map((c) => c.condition));
}

export async function runSource(
  db: Db,
  adapter: SiteAdapter,
  opts: { maxPages?: number; maxDetails?: number; scopes?: CrawlScope[] } = {},
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
    });
    await browser?.saveSession();
    const stats = await ingestCrawl(db, source, result);
    const warnings = [
      ...result.warnings,
      ...stats.warnings,
      ...(result.deferred > 0 ? [`詳細 ${result.deferred} 件は件数上限のため次回に取得`] : []),
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
        errorCount: result.errors.length,
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
    // 失敗した場合も、実際に行った検索・詳細表示の回数は必ず記録する（課金対象のため）
    if (adapter.meta.monthlyQuota) await recordUsage(db, source, counters);
  }
}
