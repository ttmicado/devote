# Devote

不動産物件を AI と壁打ちして条件を固め、レインズ・業者間サイト・不動産会社の自社サイト・ポータルを巡回して、最新の物件を LINE / メール / Instagram で届けるサービス。
キャッチコピー: 「あなたにピッタリ合う物件を、最速で・手間なく・くまなく提案してくれるAI」

- 構想と進め方: `docs/plan.md`
- アーキテクチャ: `docs/architecture.md`
- 調査資料: `docs/research/`

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
```

## 構成

- `packages/core` — ドメイン型・正規化・マッチング（純粋関数のみ。I/O を持たない）
- `packages/db` — Drizzle スキーマとマイグレーション
- `packages/scraper` — アダプター基盤と各サイトのアダプター
- `apps/*` — Phase 1 で追加する（web: Next.js、worker: pg-boss）

## 規約

- 金額は円の整数、面積は㎡。表記揺れの変換は必ず `@devote/core` の正規化関数を使う
- 賃料の比較は管理費込みの総額で行う
- パーサは純関数にし、フィクスチャ HTML でテストする。パーサを変えたら `parserVersion` を上げる
- 物件の事実（賃料・面積・空室）を LLM に生成させない
- 認証情報（レインズ等）は `.env` のみに置く。コード・フィクスチャ・ログに残さない
- コメント・ドキュメントは日本語

## スキルとサブエージェント

- スキル: `real-estate-domain`（業界知識・正規化）、`scraper-adapter`（アダプターの作り方）、`property-matching`（マッチング・AI・通知）
- サブエージェント: `real-estate-advisor`（実務レビュー）、`scraping-engineer`（アダプター実装）、`matching-ai-engineer`（AI・推薦・通知）
