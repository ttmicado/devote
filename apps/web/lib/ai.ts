import Anthropic from "@anthropic-ai/sdk";
import {
  FEATURE_DICTIONARY,
  missingEssentials,
  SearchCondition,
  type SearchPhase,
  summarizeListing,
  TARGET_AREAS,
} from "@devote/core";
import { chatMessages, getDb, users } from "@devote/db";
import { previewMatches } from "@devote/services";
import { asc, eq } from "drizzle-orm";

/**
 * 不動産営業担当を再現した AI コンシェルジュ（Claude API の tool use）。
 * - 会話から条件を構造化して update_criteria で下書きに反映
 * - preview_matches で実データの件数を見ながら、条件を緩める／絞るを相談
 * - 確定はユーザーが画面のボタンで行う（AIの推測だけで確定しない）
 *
 * 会話履歴は append-only で保存し、Claude の応答（thinking ブロック含む）は加工せずにそのまま返す。
 */
const MODEL = process.env.DEVOTE_CHAT_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.DEVOTE_CHAT_EFFORT ?? "medium") as "low" | "medium" | "high";
const MAX_TOOL_ROUNDS = 6;

const areaText = TARGET_AREAS.map((a) =>
  a.towns ? `${a.city}（${a.towns.join("・")}のみ）` : a.city,
).join("、");
const featureText = [
  ...Object.entries(FEATURE_DICTIONARY).map(([k, v]) => `${k}=${v.label}`),
  "south_facing=南向き",
].join(", ");

const SYSTEM = `あなたは不動産会社「Devote」の住まい探しコンシェルジュです。都心の賃貸・売買仲介で10年以上の経験を持つ営業担当として、お客様と会話しながら「住みたい条件」を一緒に固めます。

# サービスについて
- Devote は不動産会社の業者間サイトや各社の自社サイトを巡回し、条件に合う新着物件を最速で LINE / メールでお届けします。
- 対象エリアは ${areaText} です。対象外のエリアを希望されたら、正直に対象外であることを伝え、近い対象エリアを提案してください。
- 賃貸・売買の両方に対応しています。

# 進め方
- 質問は一度に一つ。まず「賃貸か購入か」「予算」「エリア（通勤先・よく行く場所）」「広さ・間取り」「入居（購入）時期」を優先し、細部は後から伺います。
- 賃料の予算は管理費込みの総額で確認します。
- 数値の境界は具体例で詰めます（例: 70㎡以上とのこと、69.5㎡ならいかがですか）。許容できる幅は tolerance に入れます。
- ペット可・楽器可などの入居条件は絶対条件（hard.requiredFeatures）として扱います。
- 「できれば欲しい」設備は soft に重み 0〜1 で入れます。
- 条件が分かったら、そのたびに update_criteria を呼んで下書きを更新してください。会話で触れていない項目を勝手に埋めないでください。
- エリア・ご予算・広さか間取りの3点は、確定の前に必ず伺います（そろわないと確定できません）。
- 3点がそろったら preview_matches で現在の掲載件数を確かめ、件数を添えて状況をお伝えします（例: 「この条件で、いま12件が掲載中です」）。
- 掲載中の件数が30件を超える場合は、お届けが多すぎて煩わしくならないよう、絞り込みを一つずつ提案します（例: 駅からの距離、築年数、階数、こだわりの設備）。お客様が「多めで構わない」と言えば、それ以上は求めません。
- 0件や極端に少ない場合は、件数を根拠に「どの条件を緩めると何件になりそうか」を相談します。緩める順番の目安は 築年数 → 駅徒歩 → 設備 → 広さ → エリア → 予算 です。
- お客様の検討段階（情報収集中／比較検討中／内見済みで決めたい）を会話から推定し、update_criteria の phase で設定します。決めたい段階のお客様には厳選した物件だけを届けると伝えます。
- 条件がそろったら要点を短く復唱し、画面の「この条件でお任せする」で確定できると案内します。

# 話し方
お相手は時間の限られた経営者です。ホテルのコンシェルジュのように、控えめで確かな応対をします。
- 一人称は「私」。呼びかけは控えめにし、お名前が分かれば「○○様」とお呼びします。
- 一度の返答は3文程度まで。結論を先に、理由は一言で添えます。長い前置きをしません。
- 丁寧語・尊敬語を中心にします。「させていただく」の多用や二重敬語は避けます。
- 質問は一度に一つ。選択肢を示して答えやすくします（例: 「賃貸と購入、どちらをお考えですか」）。
- 数値の条件は許容範囲を確かめます（例: 「70㎡以上とのこと、69.5㎡ならいかがですか」）。
- 賃料は管理費込みの総額で話します。
- 既に伺ったことを聞き直しません。
- 感嘆符、絵文字、カタカナ語、過剰な褒め言葉、煽り（「今だけ」「お急ぎください」など）を使いません。

# 守ること
- 物件の空室・価格・設備を推測で語らない。preview_matches の結果にある情報だけを使う。
- 押し売りや急かす言い方をしない。
- 条件の JSON や内部のツール名をお客様に見せない。

# 条件の書き方（update_criteria）
- 金額は円の整数（例: 25万円 → 250000、1億2000万円 → 120000000）。面積は㎡。
- areas.stations は駅名（「駅」を付けない。例: "六本木"）。areas.cities は区名（例: "港区"）。
- 間取りは "1K" "1LDK" "2LDK" "3LDK" "2SLDK" の形式。
- 設備タグは次から選ぶ: ${featureText}`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "update_criteria",
    description:
      "会話から分かった希望条件を下書きに反映する。指定したキーだけが上書きされる（hard / tolerance / areas は項目単位でマージ、soft は丸ごと置き換え）。お客様の発言から確実に分かった項目だけを入れる。",
    input_schema: {
      type: "object",
      properties: {
        dealType: { type: "string", enum: ["rent", "sale"], description: "賃貸=rent / 購入=sale" },
        areas: {
          type: "object",
          properties: {
            stations: { type: "array", items: { type: "string" } },
            cities: { type: "array", items: { type: "string" } },
          },
        },
        hard: {
          type: "object",
          properties: {
            maxPrice: { type: ["integer", "null"], description: "上限（円）。賃料は管理費込み" },
            minAreaSqm: { type: ["number", "null"] },
            maxWalkMinutes: { type: ["integer", "null"] },
            layouts: { type: "array", items: { type: "string" } },
            maxBuildingAgeYears: { type: ["integer", "null"] },
            minFloor: { type: ["integer", "null"] },
            requiredFeatures: { type: "array", items: { type: "string" } },
          },
        },
        tolerance: {
          type: "object",
          description: "hard 条件をどこまで超えても許容できるか（超えた分は減点して紹介する）",
          properties: {
            price: { type: "integer", description: "円" },
            areaSqm: { type: "number" },
            walkMinutes: { type: "integer" },
            buildingAgeYears: { type: "integer" },
          },
        },
        soft: {
          type: "array",
          items: {
            type: "object",
            properties: {
              feature: { type: "string" },
              weight: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["feature", "weight"],
          },
        },
        notes: {
          type: "string",
          description: "構造化しきれない希望の要約（暮らしのイメージなど）",
        },
        phase: {
          type: "string",
          enum: ["exploring", "considering", "ready"],
          description: "検討段階: 情報収集中 / 比較検討中 / 内見済みで決めたい",
        },
      },
    },
  },
  {
    name: "preview_matches",
    description:
      "現在の下書き条件で、いま掲載中の物件が何件ヒットするか、どの条件で除外されているかを調べる。条件を緩める・絞る相談の根拠に使う。",
    input_schema: { type: "object", properties: {} },
    // 自動キャッシュの区切り（システムプロンプト＋ツール定義をキャッシュ）
    cache_control: { type: "ephemeral" },
  },
];

let client: Anthropic | null = null;
const anthropic = () => {
  client ??= new Anthropic();
  return client;
};

export function emptyCondition(): SearchCondition {
  return SearchCondition.parse({
    dealType: "rent",
    areas: { stations: [], cities: [] },
    hard: {
      maxPrice: null,
      minAreaSqm: null,
      maxWalkMinutes: null,
      layouts: [],
      maxBuildingAgeYears: null,
      minFloor: null,
      requiredFeatures: [],
    },
    tolerance: {},
    soft: [],
    notes: "",
  });
}

type Patch = Partial<{
  dealType: "rent" | "sale";
  areas: Partial<SearchCondition["areas"]>;
  hard: Partial<SearchCondition["hard"]>;
  tolerance: Partial<SearchCondition["tolerance"]>;
  soft: SearchCondition["soft"];
  notes: string;
  phase: SearchPhase;
}>;

export function applyPatch(draft: SearchCondition, patch: Patch) {
  const merged = {
    ...draft,
    ...(patch.dealType ? { dealType: patch.dealType } : {}),
    areas: { ...draft.areas, ...patch.areas },
    hard: { ...draft.hard, ...patch.hard },
    tolerance: { ...draft.tolerance, ...patch.tolerance },
    soft: patch.soft ?? draft.soft,
    notes: patch.notes ?? draft.notes,
  };
  return SearchCondition.safeParse(merged);
}

export interface ChatState {
  draft: SearchCondition;
  phase: SearchPhase;
}

export async function loadChat(userId: string) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const parsed = u?.draftCondition ? SearchCondition.safeParse(u.draftCondition) : null;
  const state: ChatState = {
    draft: parsed?.success ? parsed.data : emptyCondition(),
    phase: (u?.draftPhase as SearchPhase | null) ?? "exploring",
  };
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(asc(chatMessages.id));
  return { state, rows };
}

/** 画面表示用: ユーザーの発言と AI のテキストだけを取り出す */
export function toDisplay(rows: { role: string; content: unknown }[]) {
  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (const r of rows) {
    const blocks = Array.isArray(r.content)
      ? (r.content as { type: string; text?: string; display?: boolean }[])
      : [{ type: "text", text: String(r.content) }];
    // ユーザーの発言は先頭の text ブロック（2つめ以降はシステムが付けた状態情報）
    const texts =
      r.role === "user"
        ? blocks.filter((b) => b.type === "text").slice(0, 1)
        : blocks.filter((b) => b.type === "text");
    const text = texts
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    if (text && !(r.role === "user" && blocks.every((b) => b.type === "tool_result"))) {
      out.push({ role: r.role as "user" | "assistant", text });
    }
  }
  return out;
}

/** 1ターン分の会話を進める（ツール実行を含む）。保存は append-only */
/** 依頼書に添える「この条件で掲載中 ○件」。確定に必要な条件がそろうまでは出さない */
export async function draftPreview(draft: SearchCondition) {
  if (missingEssentials(draft).length > 0) return null;
  const p = await previewMatches(getDb(), draft, summarizeListing);
  return { total: p.total, withCompromise: p.withCompromise };
}

export async function runChatTurn(userId: string, userText: string) {
  const db = getDb();
  const { state, rows } = await loadChat(userId);
  const history: Anthropic.Beta.BetaMessageParam[] = rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content as Anthropic.Beta.BetaMessageParam["content"],
  }));

  const append = async (msg: Anthropic.Beta.BetaMessageParam & { role: "user" | "assistant" }) => {
    history.push(msg);
    await db.insert(chatMessages).values({ userId, role: msg.role, content: msg.content });
  };

  await append({
    role: "user",
    content: [
      { type: "text", text: userText },
      {
        type: "text",
        text: `<current_state>\n${JSON.stringify({ phase: state.phase, draft: state.draft })}\n</current_state>`,
      },
    ],
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages: history,
    });
    // thinking ブロックを含む応答をそのまま保存・送り返す
    await append({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") break;
    if (response.stop_reason !== "tool_use") break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "update_criteria") {
        const input = block.input as Patch;
        const next = applyPatch(state.draft, input);
        if (next.success) {
          state.draft = next.data;
          if (input.phase) state.phase = input.phase;
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ ok: true, phase: state.phase, draft: state.draft }),
          });
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `条件の形式が不正です: ${next.error.message}`,
          });
        }
      } else if (block.name === "preview_matches") {
        const preview = await previewMatches(db, state.draft, summarizeListing);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(preview),
        });
      } else {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `unknown tool: ${block.name}`,
        });
      }
    }
    await append({ role: "user", content: results });
  }

  await db
    .update(users)
    .set({ draftCondition: state.draft, draftPhase: state.phase, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return state;
}
