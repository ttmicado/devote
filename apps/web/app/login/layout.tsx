import type { Metadata } from "next";
import { ACCOUNT } from "@/lib/copy";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/** メタデータだけを持つレイアウト（会員の画面のため索引させない） */
export const metadata: Metadata = {
  title: ACCOUNT.login.title,
  robots: PRIVATE_ROBOTS,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
