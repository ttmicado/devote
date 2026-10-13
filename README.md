# Devote

**あなたにピッタリ合う物件を、最速で・手間なく・くまなく提案してくれるAI**

1. 不動産営業を再現した AI チャットと壁打ちして、住みたい条件を固める
2. レインズ・業者間サイト・不動産会社の自社サイト・ポータルを定期的に巡回する
3. 条件に合う新着物件を、ユーザーが選んだ頻度で LINE / メール（/ Instagram）に届ける
4. 内見の問い合わせを受ける。客付できない物件は、類似物件を提案する

## セットアップ

```bash
nvm use               # Node.js 22
corepack enable       # pnpm 10
pnpm install
cp .env.example .env
pnpm db:up && pnpm db:migrate
pnpm test
```

## ドキュメント

- [構想・考察・進め方](docs/plan.md)
- [アーキテクチャ](docs/architecture.md)
- 調査資料: [不動産ドメイン](docs/research/01-real-estate-domain.md) / [スクレイピング基盤](docs/research/02-scraping-architecture.md) / [AIマッチング・通知](docs/research/03-ai-matching-and-notifications.md)
