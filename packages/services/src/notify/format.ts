import { type NormalizedListing, priceLabel, summarizeListing } from "@devote/core";
import type { LineMessage } from "./line";

export interface NotifyItem {
  propertyId: string;
  listing: NormalizedListing;
  score: number | null;
  reasons: string[];
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const dealLabel = (l: NormalizedListing) => (l.dealType === "rent" ? "賃貸" : "売買");

function detailUrl(appUrl: string, item: NotifyItem, notificationId: string) {
  return `${appUrl}/properties/${item.propertyId}?nid=${notificationId}`;
}

/** LINE: Flex Message の Carousel（最大12枚）を1メッセージで送る */
export function buildLineMessages(
  items: NotifyItem[],
  opts: { appUrl: string; notificationId: string; heading: string },
): LineMessage[] {
  const bubbles = items.slice(0, 12).map((item) => {
    const l = item.listing;
    const hero = l.imageUrls.find((u) => u.startsWith("https://"));
    const note =
      item.reasons.length > 0
        ? `⚠ ${item.reasons.join("・")}`
        : item.score != null
          ? "希望条件をすべて満たしています"
          : "";
    return {
      type: "bubble",
      size: "kilo",
      ...(hero
        ? {
            hero: {
              type: "image",
              url: hero,
              size: "full",
              aspectRatio: "4:3",
              aspectMode: "cover",
            },
          }
        : {}),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: `${dealLabel(l)}${item.score != null ? `｜マッチ度 ${item.score}%` : ""}`,
            size: "xs",
            color: "#0F766E",
            weight: "bold",
          },
          { type: "text", text: l.title ?? "物件", weight: "bold", size: "md", wrap: true },
          { type: "text", text: priceLabel(l), size: "md", color: "#B91C1C", weight: "bold" },
          { type: "text", text: summarizeListing(l), size: "xs", color: "#555555", wrap: true },
          ...(note
            ? [{ type: "text", text: note, size: "xxs", color: "#92400E", wrap: true }]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0F766E",
            height: "sm",
            action: {
              type: "uri",
              label: "詳細・内見の問い合わせ",
              uri: detailUrl(opts.appUrl, item, opts.notificationId),
            },
          },
        ],
      },
    };
  });
  return [
    {
      type: "flex",
      altText: `${opts.heading}（${items.length}件）`,
      contents: { type: "carousel", contents: bubbles },
    },
  ];
}

/** メール: 件名・HTML・テキスト */
export function buildEmail(
  items: NotifyItem[],
  opts: { appUrl: string; notificationId: string; heading: string; settingsUrl: string },
) {
  const cards = items
    .map((item) => {
      const l = item.listing;
      const img = l.imageUrls.find((u) => u.startsWith("https://"));
      const url = detailUrl(opts.appUrl, item, opts.notificationId);
      return `
<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
  ${img ? `<a href="${url}"><img src="${escapeHtml(img)}" width="560" style="max-width:100%;border-radius:8px" alt=""></a>` : ""}
  <div style="font-size:12px;color:#0f766e;font-weight:bold;margin-top:8px">${dealLabel(l)}${item.score != null ? `｜マッチ度 ${item.score}%` : ""}</div>
  <div style="font-size:16px;font-weight:bold"><a href="${url}" style="color:#111827">${escapeHtml(l.title ?? "物件")}</a></div>
  <div style="font-size:16px;color:#b91c1c;font-weight:bold">${escapeHtml(priceLabel(l))}</div>
  <div style="font-size:13px;color:#4b5563">${escapeHtml(summarizeListing(l))}</div>
  ${item.reasons.length ? `<div style="font-size:12px;color:#92400e">⚠ ${escapeHtml(item.reasons.join("・"))}</div>` : ""}
</td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html lang="ja"><body style="font-family:sans-serif;background:#f9fafb;padding:16px">
<table width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:16px">
<tr><td><h1 style="font-size:18px;margin:0 0 4px">${escapeHtml(opts.heading)}</h1>
<p style="font-size:13px;color:#6b7280;margin:0">Devote — あなたにピッタリ合う物件を最速でお届けします</p></td></tr>
${cards}
<tr><td style="padding-top:16px;font-size:12px;color:#9ca3af">通知の頻度・停止は <a href="${opts.settingsUrl}">設定</a> から変更できます。</td></tr>
</table></body></html>`;
  const text = [
    opts.heading,
    "",
    ...items.map(
      (i) =>
        `■ ${i.listing.title ?? "物件"}\n${priceLabel(i.listing)}\n${summarizeListing(i.listing)}\n${detailUrl(opts.appUrl, i, opts.notificationId)}`,
    ),
    "",
    `通知の設定: ${opts.settingsUrl}`,
  ].join("\n");
  return { subject: `【Devote】${opts.heading}（${items.length}件）`, html, text };
}
