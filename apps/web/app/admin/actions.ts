"use server";

import type { NormalizedListing } from "@devote/core";
import { getDb, inquiries, properties, similarSuggestions } from "@devote/db";
import { findSimilarProperties, loadNotifyItems, sendPropertiesToUser } from "@devote/services";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const STATUSES = [
  "new",
  "checking",
  "available",
  "viewing_scheduled",
  "unavailable",
  "closed",
] as const;
const REASONS = ["broker_refused", "already_applied", "condition_mismatch", "other"] as const;

export async function updateInquiryStatus(formData: FormData) {
  const id = String(formData.get("inquiryId"));
  const status = String(formData.get("status")) as (typeof STATUSES)[number];
  const reason = String(formData.get("reason") ?? "") as (typeof REASONS)[number];
  if (!STATUSES.includes(status)) throw new Error("invalid status");
  const db = getDb();
  await db
    .update(inquiries)
    .set({
      status,
      unavailableReason: status === "unavailable" && REASONS.includes(reason) ? reason : null,
      adminNote: String(formData.get("adminNote") ?? "") || null,
      updatedAt: new Date(),
    })
    .where(eq(inquiries.id, id));

  // 対応不可 → 類似物件の候補を自動で作る（客付NGの元付業者の物件は除外）
  if (status === "unavailable") {
    const [q] = await db.select().from(inquiries).where(eq(inquiries.id, id));
    const existing = await db
      .select()
      .from(similarSuggestions)
      .where(eq(similarSuggestions.inquiryId, id));
    if (q && existing.length === 0) {
      const [p] = await db.select().from(properties).where(eq(properties.id, q.propertyId));
      const agency = (p?.data as NormalizedListing | undefined)?.agencyName ?? null;
      const candidates = await findSimilarProperties(db, q.propertyId, {
        userId: q.userId,
        excludeAgency: reason === "broker_refused" ? agency : null,
        limit: 6,
      });
      if (candidates.length > 0) {
        await db.insert(similarSuggestions).values(
          candidates.map((c, i) => ({
            inquiryId: id,
            propertyId: c.propertyId,
            similarity: c.combined,
            rank: i + 1,
          })),
        );
      }
    }
  }
  revalidatePath(`/admin/inquiries/${id}`);
  revalidatePath("/admin");
}

/** 管理者が選んだ類似物件をユーザーに送る。選ばなかった候補は「却下」として記録（学習データ） */
export async function sendSimilarSuggestions(formData: FormData) {
  const inquiryId = String(formData.get("inquiryId"));
  const approved = new Set(formData.getAll("approve").map(String));
  const db = getDb();
  const [q] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
  if (!q) redirect("/admin");
  const all = await db
    .select()
    .from(similarSuggestions)
    .where(eq(similarSuggestions.inquiryId, inquiryId));
  for (const s of all) {
    await db
      .update(similarSuggestions)
      .set({ adminDecision: approved.has(s.id) ? "approved" : "rejected", updatedAt: new Date() })
      .where(eq(similarSuggestions.id, s.id));
  }
  const picked = all.filter((s) => approved.has(s.id)).sort((a, b) => a.rank - b.rank);
  if (picked.length > 0) {
    const items = await loadNotifyItems(
      db,
      picked.map((s) => s.propertyId),
    );
    const res = await sendPropertiesToUser(db, {
      userId: q.userId,
      items,
      reason: "similar",
      kind: "similar",
    });
    if (res.status === "sent") {
      for (const s of picked) {
        await db
          .update(similarSuggestions)
          .set({ sentAt: new Date() })
          .where(eq(similarSuggestions.id, s.id));
      }
    }
    redirect(`/admin/inquiries/${inquiryId}?sent=${res.status}`);
  }
  redirect(`/admin/inquiries/${inquiryId}`);
}
