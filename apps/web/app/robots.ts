import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** 会員の画面と物件ページは各ページの noindex で除く。API と管理画面は巡回もさせない */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
