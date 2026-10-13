# アーキテクチャ

## 全体像

```
┌──────────────┐   ┌──────────────┐   ┌───────────────┐
│ 情報ソース    │   │ 収集          │   │ DB (Postgres  │
│ レインズ      │──▶│ scheduler    │──▶│   + pgvector) │
│ 業者間サイト  │   │ crawl        │   │ raw_snapshots │
│ 自社サイト    │   │ normalize    │   │ listings      │
│ ポータル      │   │ diff/dedupe  │   │ properties    │
└──────────────┘   └──────────────┘   │ change_events │
                                       └──────┬────────┘
┌──────────────┐   ┌──────────────┐          │
│ ユーザー      │◀─▶│ AIチャット    │──条件───▶│ search_conditions
│ (Web/LINE/IG)│   │ Claude API   │          │
└──────▲───────┘   └──────────────┘          ▼
       │           ┌──────────────┐   ┌───────────────┐
       └───通知────│ notifier     │◀──│ matcher       │
                   │ LINE/Mail/IG │   │ score + gate  │
                   └──────────────┘   └───────────────┘
                   ┌──────────────┐
                   │ 管理画面      │ 問い合わせ → 対応不可 → 類似物件
                   └──────────────┘
```

**収集と通知は `change_events` テーブルだけでつながる**（疎結合）。巡回頻度と通知頻度は別々に設定する。

## リポジトリ構成

| パス | 役割 | 状態 |
|---|---|---|
| `packages/core` | ドメイン型（Zod）、表記揺れの正規化、設備タグ辞書、マッチングスコア、名寄せキー | 実装・テスト済み |
| `packages/db` | Drizzle スキーマ、マイグレーション（`drizzle/`） | 実装済み・適用確認済み |
| `packages/scraper` | アダプターのインターフェース、HTTPフェッチャー（レート制御・リトライ）、巡回ランナー、CLI、リファレンスアダプター | 実装・テスト済み |
| `apps/web` | Next.js: AIチャット、条件確認、管理画面 | Phase 1 |
| `apps/worker` | pg-boss: スケジューラ、収集パイプライン、マッチャー、通知 | Phase 1 |

## 技術選定

| 領域 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript / Node.js 22 | スクレイピング・Web・LINE SDK・Claude SDK を1言語でそろえられる |
| パッケージ | pnpm workspaces | モノレポ |
| DB | PostgreSQL 16 + pgvector | 類似物件推薦・名寄せのベクトル検索。キューも Postgres に寄せる |
| ORM | Drizzle | 型安全、`vector()` 型に対応 |
| キュー | pg-boss（初期） | Redis が不要。規模が大きくなったら BullMQ へ |
| スクレイピング | cheerio（静的HTML）／Playwright（JS・ログイン） | アダプターごとに `fetchMode` で選ぶ |
| AI | Claude API（`@anthropic-ai/sdk`） | 会話は Sonnet 5.5、要約・通知文は Haiku 5.5、難しい判断は Opus 5.5 |
| 埋め込み | Voyage AI 等（未決） | Claude API には埋め込みモデルがない |
| 通知 | LINE Messaging API、Resend、Instagram Messaging API | Instagram は24時間ウィンドウの制約があるため会話型の利用のみ |
| Lint/Format | Biome | 1ツールで済む |
| テスト | Vitest | パーサはフィクスチャHTMLのスナップショットテストで固定する |

## データモデル（主要テーブル）

- `raw_snapshots` — 生HTMLのメタデータ（本体はオブジェクトストレージ）。`parser_version` を見て再パースする
- `listings` — ソースごとの掲載。`(source, source_listing_id)` で一意。`miss_count` は掲載終了の判定に使う
- `properties` — 名寄せ済みの実物件。`feature_vec`（64次元）と `embedding`（1024次元）を HNSW インデックスで引く
- `change_events` — new / price_down / price_up / field_changed / delisted / relisted
- `search_conditions` — AIで固めた条件（版管理）、検討フェーズ（ゲージ）、通知頻度
- `user_channels` — LINE userId / Instagram IGSID / メール。IG の24時間判定に使う `last_inbound_at` を持つ
- `matches`、`sent_ledger`（二重送信を防ぐ）、`notifications`
- `inquiries` — 内見問い合わせ（new → checking → available / unavailable …）
- `similar_suggestions` — 類似物件の提案、管理者の判断、ユーザーの反応（AI自律化の学習データ）

## マッチング（`packages/core/src/matching.ts`）

1. 取引種別・エリア・間取り・必須設備が合わない → 除外
2. 予算（**賃料は管理費込みの総額**）・面積・駅徒歩・築年数は、**許容幅（tolerance）の中なら減点、外なら除外**
3. 基礎点80 − 減点 + soft 条件の加点（最大20）= 0〜100点
4. 検討フェーズのゲージ（`PHASE_GATE`）で閾値と件数を絞る: exploring 50点以上・20件 / considering 70点以上・8件 / ready 85点以上・3件

Phase 2 で埋め込み類似度とユーザーの反応を混ぜたハイブリッドスコアにする（`docs/research/03-ai-matching-and-notifications.md`）。
