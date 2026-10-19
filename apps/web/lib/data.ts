import type { NormalizedListing, SearchCondition, SearchPhase } from "@devote/core";
import {
  getDb,
  inquiries,
  listings,
  matches,
  properties,
  searchConditions,
  similarSuggestions,
  userChannels,
} from "@devote/db";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * 業者間の会員サイト（広く公開してはいけない情報源）。
 * packages/scraper/src/registry.ts の memberOnly: true と同じ並び（Web は scraper を import しないため写しを持つ）。
 */
// itandi-bb は 2026-10-19 に除外したが、取り込み済みの掲載を一般公開しないよう残す
export const MEMBER_ONLY_SOURCES: readonly string[] = ["reins", "atbb", "itandi-bb"];

/**
 * 一般公開してよい物件か。広告不可、または会員サイトにしか載っていない物件は、
 * ご提案を受けた会員にだけ見せる。
 */
export function isPubliclyListable(
  listing: Pick<NormalizedListing, "adAllowed">,
  sources: { source: string; adAllowed?: boolean | null }[],
) {
  if (listing.adAllowed === false) return false;
  if (sources.some((s) => s.adAllowed === false)) return false;
  if (sources.length > 0 && sources.every((s) => MEMBER_ONLY_SOURCES.includes(s.source)))
    return false;
  return true;
}

/** 管理費込みの総額（賃料の比較に使う） */
const totalOf = (l: NormalizedListing) =>
  l.price + (l.dealType === "rent" ? (l.managementFee ?? 0) : 0);

export async function latestCondition(userId: string) {
  const [c] = await getDb()
    .select()
    .from(searchConditions)
    .where(eq(searchConditions.userId, userId))
    .orderBy(desc(searchConditions.version))
    .limit(1);
  return c
    ? { ...c, condition: c.condition as SearchCondition, phase: c.phase as SearchPhase }
    : null;
}

export async function userMatches(userId: string, limit = 60) {
  const c = await latestCondition(userId);
  if (!c) return { condition: null, items: [] };
  const rows = await getDb()
    .select({
      propertyId: matches.propertyId,
      score: matches.score,
      reasons: matches.reasons,
      data: properties.data,
      firstSeen: properties.createdAt,
    })
    .from(matches)
    .innerJoin(properties, eq(properties.id, matches.propertyId))
    .where(
      and(
        eq(matches.userId, userId),
        eq(matches.conditionVersion, c.version),
        eq(properties.status, "active"),
      ),
    )
    .orderBy(desc(matches.score), desc(properties.createdAt))
    .limit(limit);
  // 並び: 適合度の高い順 → 新しい順 → 総額の低い順
  const items = rows
    .map((r) => ({
      ...r,
      listing: r.data as NormalizedListing,
      reasons: (r.reasons as string[]) ?? [],
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.firstSeen.getTime() - a.firstSeen.getTime() ||
        totalOf(a.listing) - totalOf(b.listing),
    );
  return { condition: c, items };
}

export async function propertyWithSources(id: string) {
  const db = getDb();
  const [p] = await db.select().from(properties).where(eq(properties.id, id));
  if (!p) return null;
  const sources = await db
    .select({
      source: listings.source,
      url: listings.url,
      status: listings.status,
      adAllowed: listings.adAllowed,
      firstSeenAt: listings.firstSeenAt,
      lastSeenAt: listings.lastSeenAt,
    })
    .from(listings)
    .where(eq(listings.propertyId, id));
  const listing = p.data as NormalizedListing;
  // 掲載元で最後に確かめた時刻（どの情報源でも、いちばん新しいもの）
  const lastSeenAt = sources.reduce<Date | null>(
    (m, s) => (m == null || s.lastSeenAt > m ? s.lastSeenAt : m),
    null,
  );
  return {
    ...p,
    listing,
    sources,
    lastSeenAt,
    publiclyListable: isPubliclyListable(listing, sources),
  };
}

/** この物件をご提案した（どの条件版でも）か、内見を依頼済みか。会員限定の物件を見せてよいかの判定に使う */
export async function userCanSeeProperty(userId: string, propertyId: string) {
  const db = getDb();
  const [m] = await db
    .select({ n: sql<number>`1` })
    .from(matches)
    .where(and(eq(matches.userId, userId), eq(matches.propertyId, propertyId)))
    .limit(1);
  if (m) return true;
  const [q] = await db
    .select({ n: sql<number>`1` })
    .from(inquiries)
    .where(and(eq(inquiries.userId, userId), eq(inquiries.propertyId, propertyId)))
    .limit(1);
  return Boolean(q);
}

/** 内見依頼フォームの初期値: 前回のご依頼の連絡先と、確認済みのメールアドレス */
export async function inquiryPrefill(userId: string) {
  const db = getDb();
  const [last] = await db
    .select({
      name: inquiries.contactName,
      phone: inquiries.contactPhone,
      email: inquiries.contactEmail,
    })
    .from(inquiries)
    .where(eq(inquiries.userId, userId))
    .orderBy(desc(inquiries.createdAt))
    .limit(1);
  const [mail] = await db
    .select({ address: userChannels.address })
    .from(userChannels)
    .where(
      and(
        eq(userChannels.userId, userId),
        eq(userChannels.channel, "email"),
        eq(userChannels.active, true),
      ),
    )
    .orderBy(desc(userChannels.createdAt))
    .limit(1);
  return {
    name: last?.name ?? "",
    phone: last?.phone ?? "",
    email: last?.email ?? mail?.address ?? "",
  };
}

export async function userInquiries(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ inquiry: inquiries, data: properties.data })
    .from(inquiries)
    .innerJoin(properties, eq(properties.id, inquiries.propertyId))
    .where(eq(inquiries.userId, userId))
    .orderBy(desc(inquiries.createdAt));
  const suggestions = await db
    .select({ s: similarSuggestions, data: properties.data })
    .from(similarSuggestions)
    .innerJoin(properties, eq(properties.id, similarSuggestions.propertyId))
    .innerJoin(inquiries, eq(inquiries.id, similarSuggestions.inquiryId))
    .where(and(eq(inquiries.userId, userId), eq(similarSuggestions.adminDecision, "approved")));
  return rows.map((r) => ({
    ...r.inquiry,
    listing: r.data as NormalizedListing,
    suggestions: suggestions
      .filter((s) => s.s.inquiryId === r.inquiry.id)
      .map((s) => ({ ...s.s, listing: s.data as NormalizedListing })),
  }));
}

export async function userChannelList(userId: string) {
  return getDb().select().from(userChannels).where(eq(userChannels.userId, userId));
}

/** この物件の、最新の条件版に対する適合度と「ご希望との違い」。条件が無い／マッチしていなければ null */
export async function propertyMatchForUser(userId: string, propertyId: string) {
  const c = await latestCondition(userId);
  if (!c) return null;
  const [m] = await getDb()
    .select({ score: matches.score, reasons: matches.reasons })
    .from(matches)
    .where(
      and(
        eq(matches.userId, userId),
        eq(matches.propertyId, propertyId),
        eq(matches.conditionVersion, c.version),
      ),
    )
    .limit(1);
  return m ? { score: m.score, reasons: (m.reasons as string[]) ?? [] } : null;
}
