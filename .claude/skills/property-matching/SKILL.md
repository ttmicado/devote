---
name: property-matching
description: ユーザーの希望条件（SearchCondition）と物件のマッチング、検討フェーズのゲージ、AIチャットでの条件ヒアリング（Claude tool use）、類似物件推薦、通知（LINE/メール/Instagram）の設計・実装を行うときに使う。
---

# マッチング・AIヒアリング・通知

背景資料: `docs/research/03-ai-matching-and-notifications.md`、`docs/architecture.md`。

## 条件モデル

`packages/core/src/condition.ts` の `SearchCondition`:
- `hard`: 絶対条件。数値条件は `tolerance`（許容幅）の中なら**除外せず減点**し、理由を `reasons` に残す
  - 例: 70㎡希望・許容0.5㎡ → 69.5㎡は「面積が0.5㎡不足」として残る
- `soft`: 加点条件（feature タグ + 重み 0〜1）
- `PHASE_GATE`: 検討フェーズ（exploring/considering/ready）ごとのスコア閾値と最大件数

スコア計算の変更は `packages/core/src/matching.test.ts` を先に書き換え、意図した挙動をテストで固定してから実装する。

## AIヒアリング（Claude API）

- 会話: `claude-sonnet-5-5`、要約・通知文: `claude-haiku-5-5`、難しい判断: `claude-opus-5-5`（`.env` の `DEVOTE_*_MODEL` で切り替える）
- ツール: `update_criteria`（差分と根拠の引用）、`ask_clarification`、`preview_matches`（件数を見て緩める・絞るを相談）、`confirm_criteria`
- AIの推測だけで条件を確定させない。ユーザーが確認カードで承認したら `search_conditions` に新しい版として保存する
- 物件の事実（賃料・面積・空室）をAIに生成させない。DBの値をテンプレートに差し込む
- Claude API の実装前に `claude-api` スキルを読み込むこと

## 通知

- **LINE がメイン**（Flex Message の Carousel、ダイジェストにまとめて通数を節約する、`X-Line-Retry-Key`）
- メールは Resend（`EmailProvider` で抽象化しておく）
- **Instagram は24時間ウィンドウの制約で定期プッシュ不可**。ユーザーからDMが来たら24時間以内に新着を返す会話型の利用に限る（`user_channels.last_inbound_at` で判定する）
- 二重送信の防止: 送信前に `sent_ledger` へ `INSERT ... ON CONFLICT DO NOTHING`。値下げは `reason='price_down'` として別キー
- 送る直前に掲載中か・対応不可になっていないかを再確認する

## 類似物件（対応不可時）

- `inquiries.status = 'unavailable'` になったら、`properties.feature_vec` の近傍とユーザー条件スコアを合成して候補を出す。**客付NGになった業者の物件は除外する**
- 候補・管理者の判断・ユーザーの反応は `similar_suggestions` に必ず記録する（将来AIに自律判断させるための学習データ）
