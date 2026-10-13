import type { Metadata } from "next";
import { NAV } from "@/lib/copy";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/** メタデータだけを持つレイアウト（会員の画面のため索引させない） */
export const metadata: Metadata = {
  title: NAV[3].ja,
  robots: PRIVATE_ROBOTS,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
