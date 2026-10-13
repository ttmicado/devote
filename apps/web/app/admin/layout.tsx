import type { Metadata } from "next";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/** メタデータだけを持つレイアウト（運営者向けの画面のため索引させない） */
export const metadata: Metadata = {
  title: "管理画面",
  robots: PRIVATE_ROBOTS,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
