import { COMPANY } from "@devote/core";
import type { Metadata } from "next";
import { loadHomeData } from "@/components/home/data";
import { Hero } from "@/components/home/hero";
import { ReportSection } from "@/components/home/report";
import {
  ClosingSection,
  CompareSection,
  FaqSection,
  FlowSection,
  PromiseSection,
  StaffSection,
} from "@/components/home/sections";
import { AREAS, HOME } from "@/lib/copy";
import { BASE_OPEN_GRAPH, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

/** 巡回の実績と見本の物件は10分ごとに作り直す（毎回 DB を読まない） */
export const revalidate = 600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...BASE_OPEN_GRAPH, url: "/" },
};

/** 構造化データ（会社・サイト・サービス・よくあるご質問）。値は COMPANY と copy.ts の事実だけ */
function jsonLd() {
  const org = {
    "@type": ["Organization", "RealEstateAgent"],
    "@id": `${SITE_URL}/#organization`,
    name: COMPANY.name,
    brand: COMPANY.service,
    url: COMPANY.url,
    logo: `${SITE_URL}/apple-icon.png`,
    ...(COMPANY.address ? { address: COMPANY.address } : {}),
    ...(COMPANY.phone ? { telephone: COMPANY.phone } : {}),
    ...(COMPANY.email ? { email: COMPANY.email } : {}),
  };
  const areaServed = AREAS.map((a) => ({
    "@type": "Place",
    name: `東京都${a.ja.replace(" ", "")}`,
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        inLanguage: "ja",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Service",
        name: `${SITE_NAME}（物件探しのコンシェルジュ）`,
        serviceType: "不動産の仲介（賃貸・売買・事業用賃貸）",
        description: SITE_DESCRIPTION,
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed,
        url: `${SITE_URL}/`,
      },
      {
        "@type": "FAQPage",
        mainEntity: HOME.faq.items.map((it) => ({
          "@type": "Question",
          name: it.q,
          acceptedAnswer: { "@type": "Answer", text: it.a },
        })),
      },
    ],
  };
}

/**
 * トップページ。明るい面（生成り）と暗い面（深緑）を交互に重ねる。
 * 数字と見本の物件はすべて DB の実データ（DB が空でも崩れない）。
 */
export default async function Home() {
  const { crawl, samples } = await loadHomeData();
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c"),
        }}
      />
      <Hero crawl={crawl} samples={samples} />
      <FlowSection />
      <CompareSection />
      <ReportSection samples={samples} />
      <PromiseSection />
      <StaffSection />
      <FaqSection />
      <ClosingSection />
    </main>
  );
}
