import { loadHomeData } from "@/components/home/data";
import { Hero } from "@/components/home/hero";
import { ReportSection } from "@/components/home/report";
import {
  AreasSection,
  ClosingSection,
  CurationSection,
  FaqSection,
  FlowSection,
  ProblemSection,
  PromiseSection,
  SourcesSection,
  ViewingSection,
} from "@/components/home/sections";

export const dynamic = "force-dynamic";

/**
 * トップページ。明るい面（生成り）と暗い面（深緑）を交互に重ねる。
 * 数字と見本の物件はすべて DB の実データ（DB が空でも崩れない）。
 */
export default async function Home() {
  const { crawl, samples } = await loadHomeData();
  return (
    <main>
      <Hero crawl={crawl} />
      <ProblemSection />
      <PromiseSection />
      <FlowSection />
      <ReportSection samples={samples} />
      <SourcesSection />
      <CurationSection />
      <ViewingSection />
      <AreasSection />
      <FaqSection />
      <ClosingSection />
    </main>
  );
}
