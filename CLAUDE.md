# Devote

不動産物件を AI と壁打ちして条件を固め、レインズ・業者間サイト・不動産会社の自社サイト・ポータルを巡回して、最新の物件を LINE / メールで届けるサービス。対象は時間がなく優秀な経営者で、Devote はその「住まいのコンシェルジュ」。
キャッチコピー: 「あなたにピッタリ合う物件を、最速で・手間なく・くまなく提案してくれるAI」

- 構想と進め方: `docs/plan.md`
- アーキテクチャ: `docs/architecture.md`
- 調査資料: `docs/research/`
- **運用の約束と現在の状態: `docs/operations.md`**（作業を始める前に読む）

## 複数の環境で作業するときの約束

このリポジトリは複数の環境（別々の Claude セッション・人）から同時に変更される。

- 作業を始めたら、`docs/operations.md` の「現在の状態」を読む。前回の監査以降に既定ブランチへ入った変更があれば、サブエージェント `ops-auditor`（手順はスキル `devote-operations`）で監査する
- 別環境の枝・PR を取り込む／マージする前にも監査する
- 運用に関わる変更（ソース・エリア・物件種別、件数・頻度・時間、DB スキーマ、公開範囲、写真、ログイン）をしたら、`docs/operations.md` の「現在の状態」と「決定の記録」を同じ PR で更新する
- `packages/db/drizzle/` への push は、ブランチを問わずすぐ本番の DB に適用される。古いコードでも動く変更にする

## コマンド

```bash
pnpm install
pnpm test          # Vitest（全パッケージ）
pnpm typecheck
pnpm lint          # Biome（自動修正は npx biome check --write .）
pnpm db:up         # docker compose で Postgres + pgvector を起動（ローカル開発）
pnpm db:migrate    # DATABASE_URL に対してマイグレーションを実行
pnpm db:generate   # packages/db/src/schema.ts の変更からマイグレーションを生成
pnpm scrape sample-realtor --fixtures   # スクレイパーのオフラインデモ
pnpm dev                       # Web（apps/web, http://localhost:3000）。apps/web/.env.local に環境変数
pnpm worker crawl [sourceId]   # 巡回 → DB 取り込み（省略時は有効な全ソース）
pnpm worker all                # 巡回 → マッチング → 通知（GitHub Actions が30分ごとに実行）
```

デプロイ構成と手順は `docs/deploy.md`、会員サイト（レインズ・ATBB・ITANDI BB）は `docs/member-sites.md`。

## 構成

- `packages/core` — ドメイン型・正規化・マッチング（純粋関数のみ。I/O を持たない）
- `packages/db` — Drizzle スキーマとマイグレーション
- `packages/scraper` — アダプター基盤と各サイトのアダプター（登録は `src/registry.ts`）
- `packages/services` — マッチング、類似物件、通知（LINE / メール）。Web とバッチの両方から使う
- `packages/pipeline` — 巡回結果の取り込み（差分検知・名寄せ・掲載終了）とバッチ CLI
- `apps/web` — Next.js 16（AIチャット、物件、問い合わせ、通知設定、管理画面 /admin、LINE Webhook）

Web から import するパッケージ（core / db / services）は Turbopack のため**拡張子なしの相対 import** にする（`./foo`、`./foo.js` は不可）。

## 規約

- 金額は円の整数、面積は㎡。表記揺れの変換は必ず `@devote/core` の正規化関数を使う
- 賃料の比較は管理費込みの総額で行う
- パーサは純関数にし、フィクスチャ HTML でテストする。パーサを変えたら `parserVersion` を上げる
- 物件の事実（賃料・面積・空室）を LLM に生成させない
- 認証情報（レインズ等）は `.env` のみに置く。コード・フィクスチャ・ログに残さない
- コメント・ドキュメントは日本語
- 画面の文言は `apps/web/lib/copy.ts` に集約し、色・書体・部品は `.claude/skills/devote-design` に従う

## スキルとサブエージェント

- スキル: `devote-operations`（運用状況の把握・別環境の変更の監査・巡回の確認）、`real-estate-domain`（業界知識・正規化）、`scraper-adapter`（アダプターの作り方）、`property-matching`（マッチング・AI・通知）、`devote-design`（画面のデザインシステムと文言のトーン。Web の画面を触るときは必ず読む）
- サブエージェント: `ops-auditor`（別環境の変更と本番の巡回の監査）、`real-estate-advisor`（実務レビュー）、`scraping-engineer`（アダプター実装）、`matching-ai-engineer`（AI・推薦・通知）、`brand-designer`（画面のデザイン・文言）
