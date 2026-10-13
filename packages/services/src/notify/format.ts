import { headlinePrice, keyFacts, type NormalizedListing } from "@devote/core";
import { personalLink } from "../link-token";
import type { LineMessage } from "./line";

export interface NotifyItem {
  propertyId: string;
  listing: NormalizedListing;
  score: number | null;
  reasons: string[];
}

/** 通知の種類ごとの文言（apps/web/lib/copy.ts とトーンを合わせる） */
export type NotifyKind = "new" | "similar";

export function notifyCopy(kind: NotifyKind, count: number) {
  return kind === "new"
    ? {
        heading: `ご希望に適う物件が見つかりました（${count}件）`,
        subject: `【Devote】ご希望に適う物件が${count}件見つかりました`,
        intro: `Devote のコンシェルジュです。\n承ったご希望に適う物件が、新たに${count}件見つかりました。お手すきの際にご覧ください。`,
      }
    : {
        heading: `先日の物件に近いものを、お持ちしました（${count}件）`,
        subject: `【Devote】先日の物件に近い${count}件をお持ちしました`,
        intro:
          "Devote のコンシェルジュです。\nご依頼いただいた物件に近い条件のものを、改めて選びました。ご検討の一助になれば幸いです。",
      };
}

const BRAND = {
  evergreen: "#1b3a2e",
  evergreenDark: "#142821",
  sand: "#f7efe2",
  sandLine: "#e3d4b9",
  label: "#7f6d51",
  ink: "#26221e",
  inkSoft: "#675e53",
};

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const dealLabel = (l: NormalizedListing) => (l.dealType === "rent" ? "RENT" : "SALE");

interface LinkOpts {
  appUrl: string;
  notificationId: string;
  /** 宛先ユーザー。指定すると通知から開いたときに本人を引き継ぐ署名付きリンクにする */
  userId?: string;
}

function detailUrl(opts: LinkOpts, item: NotifyItem, hash = "") {
  return personalLink(
    opts.appUrl,
    `/properties/${item.propertyId}?nid=${opts.notificationId}${hash}`,
    opts.userId,
  );
}

function differenceLine(item: NotifyItem): string {
  if (item.reasons.length > 0) return item.reasons.slice(0, 2).join(" ／ ");
  return item.score != null ? "ご希望をすべて満たしています" : "";
}

/** LINE: Flex Message の Carousel を1メッセージで送る（無料通数の節約） */
export function buildLineMessages(
  items: NotifyItem[],
  opts: LinkOpts & { kind?: NotifyKind; heading?: string },
): LineMessage[] {
  const copy = notifyCopy(opts.kind ?? "new", items.length);
  const bubbles: Record<string, unknown>[] = items.slice(0, 11).map((item) => {
    const l = item.listing;
    const hero = l.imageUrls.find((u) => u.startsWith("https://"));
    const price = headlinePrice(l);
    const diff = differenceLine(item);
    return {
      type: "bubble",
      size: "kilo",
      styles: { body: { backgroundColor: BRAND.sand }, footer: { backgroundColor: BRAND.sand } },
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
            text: `${dealLabel(l)}${item.score != null ? `  ·  適合度 ${item.score}` : ""}`,
            size: "xxs",
            color: BRAND.label,
            weight: "bold",
          },
          {
            type: "text",
            text: l.title ?? "物件",
            weight: "bold",
            size: "md",
            wrap: true,
            color: BRAND.ink,
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: price.label, size: "xxs", color: BRAND.inkSoft, flex: 0 },
              {
                type: "text",
                text: price.amount,
                size: "lg",
                weight: "bold",
                color: BRAND.evergreen,
              },
            ],
          },
          {
            type: "text",
            text: keyFacts(l).join(" · "),
            size: "xs",
            color: BRAND.inkSoft,
            wrap: true,
          },
          ...(diff
            ? [{ type: "text", text: diff, size: "xxs", color: BRAND.label, wrap: true }]
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
            color: BRAND.evergreen,
            height: "sm",
            action: { type: "uri", label: "詳しく見る", uri: detailUrl(opts, item) },
          },
          {
            type: "button",
            style: "link",
            color: BRAND.evergreen,
            height: "sm",
            action: {
              type: "uri",
              label: "内見を依頼する",
              uri: detailUrl(opts, item, "#inquiry"),
            },
          },
        ],
      },
    };
  });
  // 最後に「すべてのご提案を見る」
  bubbles.push({
    type: "bubble",
    size: "kilo",
    styles: { body: { backgroundColor: BRAND.evergreenDark } },
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      spacing: "md",
      contents: [
        { type: "text", text: "SELECTIONS", size: "xxs", color: "#cfbc98", align: "center" },
        {
          type: "text",
          text: "すべてのご提案を見る",
          size: "md",
          color: "#f0e4d0",
          align: "center",
          action: {
            type: "uri",
            label: "ご提案を見る",
            uri: personalLink(opts.appUrl, "/matches", opts.userId),
          },
        },
      ],
    },
  });
  return [
    {
      type: "flex",
      altText: opts.heading ?? copy.heading,
      contents: { type: "carousel", contents: bubbles },
    },
  ];
}

/** メール: 件名・HTML・テキスト */
export function buildEmail(
  items: NotifyItem[],
  opts: LinkOpts & {
    kind?: NotifyKind;
    heading?: string;
    settingsUrl: string;
    /** お呼びする名前（あれば冒頭で「○○様」） */
    nickname?: string | null;
  },
) {
  const base = notifyCopy(opts.kind ?? "new", items.length);
  const copy = opts.nickname ? { ...base, intro: `${opts.nickname}様\n${base.intro}` } : base;
  const heading = opts.heading ?? copy.heading;
  const cards = items
    .map((item) => {
      const l = item.listing;
      const img = l.imageUrls.find((u) => u.startsWith("https://"));
      const url = detailUrl(opts, item);
      const price = headlinePrice(l);
      const diff = differenceLine(item);
      return `
<tr><td style="padding:28px 0;border-bottom:1px solid ${BRAND.sandLine}">
  ${img ? `<a href="${url}"><img src="${escapeHtml(img)}" width="520" style="display:block;width:100%;max-width:520px;height:auto" alt=""></a>` : ""}
  <div style="font:600 10px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.24em;color:${BRAND.label};margin-top:16px">${dealLabel(l)}${item.score != null ? ` &nbsp;·&nbsp; 適合度 ${item.score}` : ""}</div>
  <div style="font:500 19px/1.5 'Hiragino Mincho ProN','Yu Mincho',serif;margin-top:6px"><a href="${url}" style="color:${BRAND.ink};text-decoration:none">${escapeHtml(l.title ?? "物件")}</a></div>
  <div style="margin-top:8px;color:${BRAND.evergreen};font:600 22px/1.4 Georgia,serif">${escapeHtml(price.amount)} <span style="font:400 11px Helvetica,Arial,sans-serif;color:${BRAND.inkSoft}">${escapeHtml(price.label)}</span></div>
  ${price.note ? `<div style="font-size:12px;color:${BRAND.inkSoft}">${escapeHtml(price.note)}</div>` : ""}
  <div style="font-size:13px;line-height:1.8;color:${BRAND.inkSoft};margin-top:6px">${escapeHtml(keyFacts(l).join(" · "))}</div>
  ${diff ? `<div style="font-size:12px;line-height:1.8;color:${BRAND.label};margin-top:4px">— ${escapeHtml(diff)}</div>` : ""}
  <div style="margin-top:16px"><a href="${url}" style="display:inline-block;padding:11px 26px;border-radius:999px;background:${BRAND.evergreen};color:${BRAND.sand};font:500 12px Helvetica,Arial,sans-serif;letter-spacing:.14em;text-decoration:none">詳しく見る・内見を依頼する</a></div>
</td></tr>`;
    })
    .join("");
  const intro = copy.intro
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>");
  const html = `<!doctype html><html lang="ja"><body style="margin:0;background:${BRAND.sand};padding:24px 12px;font-family:'Hiragino Sans','Yu Gothic',sans-serif;color:${BRAND.ink}">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse">
<tr><td style="padding:8px 0 24px;text-align:center;border-bottom:1px solid ${BRAND.sandLine}">
  <div style="font:300 30px/1 Georgia,'Times New Roman',serif;color:${BRAND.evergreenDark}">Devote</div>
  <div style="font:500 8px/1 Helvetica,Arial,sans-serif;letter-spacing:.42em;color:${BRAND.label};margin-top:6px">PROPERTY CONCIERGE</div>
</td></tr>
<tr><td style="padding:28px 0 4px">
  <div style="font:500 20px/1.6 'Hiragino Mincho ProN','Yu Mincho',serif;color:${BRAND.evergreenDark}">${escapeHtml(heading)}</div>
  <p style="font-size:14px;line-height:1.9;color:${BRAND.inkSoft};margin:12px 0 0">${intro}</p>
</td></tr>
${cards}
<tr><td style="padding-top:28px;font-size:12px;line-height:1.8;color:${BRAND.inkSoft}">
  お届けの頻度・件数は <a href="${opts.settingsUrl}" style="color:${BRAND.evergreen}">お届け設定</a> からいつでも変更できます。<br>
  掲載情報は各情報源の内容に基づきます。最新の募集状況は内見のご依頼時に確認します。
</td></tr>
</table></body></html>`;
  const text = [
    heading,
    "",
    copy.intro,
    "",
    ...items.map(
      (i) =>
        `■ ${i.listing.title ?? "物件"}\n${headlinePrice(i.listing).label} ${headlinePrice(i.listing).amount}\n${keyFacts(i.listing).join(" · ")}\n${detailUrl(opts, i)}`,
    ),
    "",
    `お届け設定: ${opts.settingsUrl}`,
  ].join("\n");
  return { subject: copy.subject, html, text };
}
