import { FEATURE_DICTIONARY, formatYen, type SearchCondition } from "@devote/core";

const featureLabel = (f: string) =>
  FEATURE_DICTIONARY[f]?.label ?? (f === "south_facing" ? "南向き" : f);

export function conditionLines(c: SearchCondition): [string, string][] {
  const h = c.hard;
  const t = c.tolerance;
  const lines: [string, string][] = [["種別", c.dealType === "rent" ? "賃貸" : "購入"]];
  const areas = [...c.areas.cities, ...c.areas.stations.map((s) => `${s}駅`)];
  if (areas.length) lines.push(["エリア", areas.join("・")]);
  if (h.maxPrice != null)
    lines.push([
      c.dealType === "rent" ? "賃料（管理費込）" : "価格",
      `${formatYen(h.maxPrice)}以下${t.price ? `（+${formatYen(t.price)}まで許容）` : ""}`,
    ]);
  if (h.minAreaSqm != null)
    lines.push(["広さ", `${h.minAreaSqm}㎡以上${t.areaSqm ? `（-${t.areaSqm}㎡まで許容）` : ""}`]);
  if (h.layouts.length) lines.push(["間取り", h.layouts.join("・")]);
  if (h.maxWalkMinutes != null)
    lines.push([
      "駅徒歩",
      `${h.maxWalkMinutes}分以内${t.walkMinutes ? `（+${t.walkMinutes}分まで許容）` : ""}`,
    ]);
  if (h.maxBuildingAgeYears != null)
    lines.push([
      "築年数",
      `${h.maxBuildingAgeYears}年以内${t.buildingAgeYears ? `（+${t.buildingAgeYears}年まで許容）` : ""}`,
    ]);
  if (h.minFloor != null) lines.push(["階数", `${h.minFloor}階以上`]);
  if (h.requiredFeatures.length)
    lines.push(["必須", h.requiredFeatures.map(featureLabel).join("・")]);
  if (c.soft.length)
    lines.push(["あると嬉しい", c.soft.map((s) => featureLabel(s.feature)).join("・")]);
  if (c.notes) lines.push(["メモ", c.notes]);
  return lines;
}

export function ConditionSummary({ condition }: { condition: SearchCondition }) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      {conditionLines(condition).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const PHASE_LABELS = {
  exploring: { label: "情報収集中", help: "幅広くお届けします（最大20件／回）" },
  considering: { label: "比較検討中", help: "条件に近いものを中心に（最大8件／回）" },
  ready: { label: "内見済み・決めたい", help: "厳選した2〜3件だけをお届けします" },
} as const;
