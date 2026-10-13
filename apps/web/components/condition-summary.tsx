import {
  FEATURE_DICTIONARY,
  formatYen,
  type SearchCondition,
  type SearchPhase,
} from "@devote/core";
import { CHAT } from "@/lib/copy";

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

/** 会話から何か一つでも条件が伺えているか（種別だけは既定値なので数えない） */
export function hasConditionContent(c: SearchCondition) {
  return conditionLines(c).length > 1;
}

/** 折りたたみ用の一行要約: 「港区など・2LDK・総額60万円まで」と残りの項目数 */
export function briefHeadline(c: SearchCondition): { text: string; rest: number } {
  const areas = [...c.areas.cities, ...c.areas.stations.map((s) => `${s}駅`)];
  const parts: string[] = [];
  let shown = 0;
  if (areas.length) {
    parts.push(areas.length > 1 ? `${areas[0]}など` : `${areas[0]}`);
    shown++;
  }
  if (c.hard.layouts.length) {
    parts.push(`${c.hard.layouts[0]}${c.hard.layouts.length > 1 ? "など" : ""}`);
    shown++;
  }
  if (c.hard.maxPrice != null) {
    parts.push(`${c.dealType === "rent" ? "総額" : ""}${formatYen(c.hard.maxPrice)}まで`);
    shown++;
  }
  const first = conditionLines(c)[1];
  if (!parts.length && first) {
    // エリア・間取り・予算がまだなら、伺えている最初の項目を出す
    parts.push(`${first[0]} ${first[1]}`);
    shown++;
  }
  return { text: parts.join("・"), rest: Math.max(0, conditionLines(c).length - 1 - shown) };
}

/** 「1,000円以下（+2万円まで許容）」の括弧部分を補足として分ける */
function splitNote(v: string): [string, string | null] {
  const m = v.match(/^(.*?)（(.+)）$/);
  return m?.[1] && m[2] ? [m[1], m[2]] : [v, null];
}

/** 罫線区切りの定義リスト（依頼書の本文）。他画面からも使う */
export function ConditionSummary({ condition }: { condition: SearchCondition }) {
  return <BriefRows rows={conditionLines(condition)} />;
}

function BriefRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-ink-900/10 border-y border-ink-900/15">
      {rows.map(([k, v]) => {
        const [main, note] = splitNote(v);
        return (
          <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-2.5">
            <dt className="pt-0.5 text-[12px] leading-6 tracking-[0.12em] text-ink-500">{k}</dt>
            <dd className="font-mincho text-[15px] leading-7 text-ink-900 [word-break:auto-phrase]">
              {main}
              {note && (
                <span className="block font-sans text-[12px] leading-6 tracking-wide text-ink-500">
                  {note}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * 「承ったご希望」を依頼書のように見せる（チャット画面の右側・スマホの展開パネル）。
 * date はサーバーで日本時間に整形した文字列（"2026.10.13"）を渡す。
 */
export function ConditionBrief({
  condition,
  phase,
  date,
  headingLevel = 2,
}: {
  condition: SearchCondition;
  phase: SearchPhase;
  date: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const filled = hasConditionContent(condition);
  return (
    <article className="border border-ink-900/15 bg-sand-100/50 p-1.5">
      <div className="border border-ink-900/10 px-5 pt-6 pb-5 sm:px-8 sm:pt-7 sm:pb-6">
        <header className="flex items-baseline justify-between gap-4">
          <p className="eyebrow text-sand-600">{CHAT.briefEyebrow}</p>
          <p className="font-serif text-[15px] tracking-[0.08em] text-ink-500">
            <time>{date}</time>
          </p>
        </header>
        <Heading className="display mt-3 font-mincho text-[1.6rem] text-evergreen-900">
          {CHAT.briefTitle}
        </Heading>

        <div className="mt-6">
          {filled ? (
            <BriefRows
              rows={[
                ...conditionLines(condition),
                [CHAT.briefPhase, `${PHASE_LABELS[phase].label}（${PHASE_LABELS[phase].help}）`],
              ]}
            />
          ) : (
            <>
              <p className="font-mincho text-sm leading-7 text-ink-500 [word-break:auto-phrase]">
                {CHAT.briefEmpty}
              </p>
              <dl
                className="mt-5 divide-y divide-ink-900/10 border-y border-ink-900/15"
                aria-hidden
              >
                {["エリア", "ご予算", "広さ・間取り", "駅徒歩"].map((k) => (
                  <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-2.5">
                    <dt className="text-[12px] leading-6 tracking-[0.12em] text-ink-300">{k}</dt>
                    <dd className="font-serif leading-6 text-ink-300">—</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>

        <p className="mt-6 text-right font-serif text-lg italic tracking-[0.02em] text-evergreen-800">
          {CHAT.briefSign}
        </p>
      </div>
    </article>
  );
}

export const PHASE_LABELS = {
  exploring: { label: "情報収集中", help: "幅広くお届けします（最大20件／回）" },
  considering: { label: "比較検討中", help: "条件に近いものを中心に（最大8件／回）" },
  ready: { label: "内見済み・決めたい", help: "厳選した2〜3件だけをお届けします" },
} as const;
