import { join } from "node:path";
import { crawlRuns, type Db, listings } from "@devote/db";
import {
  type BrowserFetchContext,
  crawlSource,
  createBrowserFetchContext,
  createHttpFetcher,
  type FetchContext,
  type SiteAdapter,
} from "@devote/scraper";
import { and, eq, isNotNull } from "drizzle-orm";
import { ingestCrawl } from "./ingest.js";

/** 1ソースを巡回して DB に反映し、crawl_runs に結果を残す */
const MAX_DETAILS = Number(process.env.DEVOTE_MAX_DETAILS_PER_SOURCE ?? 300);

export async function runSource(
  db: Db,
  adapter: SiteAdapter,
  opts: { maxPages?: number; maxDetails?: number } = {},
) {
  const source = adapter.meta.id;
  const [run] = await db.insert(crawlRuns).values({ source, status: "running" }).returning();
  if (!run) throw new Error("crawl_runs insert failed");

  const usesBrowser =
    adapter.meta.fetchMode.list === "browser" || adapter.meta.fetchMode.detail === "browser";
  let browser: BrowserFetchContext | null = null;
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
      maxDetails: opts.maxDetails ?? MAX_DETAILS,
    });
    await browser?.saveSession();
    const stats = await ingestCrawl(db, source, result);
    const warnings = [
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
    return { source, ok: true as const, ...stats, errors: result.errors.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .update(crawlRuns)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(crawlRuns.id, run.id));
    return { source, ok: false as const, error: message };
  } finally {
    await browser?.close();
  }
}
