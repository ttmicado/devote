import { headlinePrice, keyFacts } from "@devote/core";
import type { Metadata } from "next";
import { cache } from "react";
import { propertyWithSources } from "@/lib/data";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/** 同じリクエストの中で物件を二度読まない */
const getProperty = cache(async (id: string) => {
  try {
    return await propertyWithSources(id);
  } catch (e) {
    console.error("[properties/layout] 物件の読み込みに失敗しました", e);
    return null;
  }
});

/**
 * 物件ページのメタデータ。事実（価格・広さ・最寄り駅）は DB の値だけを使い、LLM には作らせない。
 * 物件は第三者の掲載情報なので検索エンジンには載せない。OG 画像もサイト共通のもの（掲載元の写真は使わない）。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getProperty(id);
  if (!p) return { robots: PRIVATE_ROBOTS };
  // 会員限定の物件は、共有されたリンクのプレビューにも名前・価格を出さない
  if (!p.publiclyListable) return { title: "会員の方へのご案内", robots: PRIVATE_ROBOTS };
  const l = p.listing;
  const price = headlinePrice(l);
  const facts = keyFacts(l);
  return {
    title: l.title ?? facts[0] ?? "物件",
    description: [`${price.label} ${price.amount}`, ...facts].join("・"),
    robots: PRIVATE_ROBOTS,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
