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
import { and, desc, eq } from "drizzle-orm";

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
  return {
    condition: c,
    items: rows.map((r) => ({
      ...r,
      listing: r.data as NormalizedListing,
      reasons: (r.reasons as string[]) ?? [],
    })),
  };
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
      firstSeenAt: listings.firstSeenAt,
    })
    .from(listings)
    .where(eq(listings.propertyId, id));
  return { ...p, listing: p.data as NormalizedListing, sources };
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
