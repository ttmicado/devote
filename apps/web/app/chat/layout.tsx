import type { Metadata } from "next";
import { CHAT } from "@/lib/copy";

/** メタデータだけを持つレイアウト（対話の画面は人ごとに内容が違うため索引させない。リンクは辿らせる） */
export const metadata: Metadata = {
  title: CHAT.title,
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
