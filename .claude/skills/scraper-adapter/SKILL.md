---
name: scraper-adapter
description: 不動産サイト（レインズ、業者間サイト、不動産会社の自社サイト、ポータル）向けのスクレイピングアダプターを新規作成・修正するときの手順。HTML構造の調査、cheerio/Playwright の選択、パーサ実装、フィクスチャによるテスト、レート制御、ログインセッション、構造変化への対応を扱う。
---

# スクレイパーアダプターの作り方

設計の背景は `docs/research/02-scraping-architecture.md`。インターフェースは `packages/scraper/src/adapter.ts`。
**リファレンス実装 `packages/scraper/src/adapters/sample-realtor/` をコピーして始める。**

## 手順

1. **サイト調査**（実装の前に）
   - 一覧URLの組み立て方（エリア・種別・ページング）、詳細URL、物件IDの位置
   - 値がSSRのHTMLにあるか → あれば `fetchMode: "http"`（cheerio）
   - SPAなら DevTools の Network で内部JSON APIを探す → 見つかれば `fetchList`/`fetchDetail` を上書きしてJSONを返す（ブラウザ不要）
   - JS描画が必須、またはログインが必要 → `"browser"`（Playwright）。ログインのみJSが必要ならログイン後のcookieでHTTP取得
2. **フィクスチャ保存**: 一覧2ページ分と詳細3件以上を `__fixtures__/` に保存（個人情報・業者の担当者名・電話番号はマスク）
3. **アダプター実装** `packages/scraper/src/adapters/<id>/index.ts`
   - `parseList` / `parseDetail` / `normalize` は**I/Oを持たない純関数**にする
   - 値の変換は必ず `@devote/core` の正規化関数を使う（独自の正規表現で金額や面積を変換しない）。足りなければ core 側に追加してテストする
   - 想定外の構造では黙って null を返すのではなく、必須項目（ID・賃料/価格）が取れなければ throw する（ランナーが errors に集計する）
   - `meta.parserVersion` はパーサを変えるたびに上げる
4. **テスト** `index.test.ts`: parseList（件数・次ページ・総件数）、normalize のスナップショット、表記揺れのケース
5. **登録**: `packages/scraper/src/registry.ts` に追加（`production` / `verified` フラグ。未検証は `ENABLE_UNVERIFIED_SOURCES=1` のときだけ巡回）
6. **確認**: `pnpm test`、`pnpm typecheck`、`pnpm lint`。実サイトでは `DEVOTE_MAX_DETAILS_PER_SOURCE=5 pnpm worker crawl <id>`（ローカルDBに取り込み）で確認する

## 実装済みのソース

| ID | サイト | 取得方式 |
|---|---|---|
| `sumitomo-residence` / `sumitomo-latour` | 住友不動産 ラ・トゥール（2サイト・共通実装） | HTTP（建物→空室ページを束ねる） |
| `mori-living` | 森ビル | 内部JSON API＋詳細HTML |
| `rf12` | REIT FIND | HTTP（SSR） |
| `kencorp` | ケン・コーポレーション（賃貸＋売買） | 一覧は内部JSON API、詳細はSSR |
| `axel-home` | アクセルホーム | HTTP（SSR） |
| `reins` / `atbb` / `itandi-bb` | 会員サイト | Playwright（未検証。`docs/member-sites.md`） |

## レート制御・マナー

- `rateLimit.minIntervalMs` はデフォルト 2000ms 以上。会員サイトは `maxConcurrency: 1`
- 429/5xx はフェッチャーが指数バックオフで再試行する。404/410 は掲載終了の候補
- 画像は詳細のURLだけ保持し、巡回時にダウンロードしない

## 会員サイト（レインズ、ATBB 等）

- 認証情報は `.env`（`REINS_USER_ID` 等）から読み、**コードやフィクスチャにID/パスワードを書かない**
- `login()` と `isLoggedOut()` を実装する。2FA・CAPTCHA が出たら自動で突破しようとせず、エラーにして人に知らせる
- 1アカウントにつき同時実行1

## 構造変化への対応

- ランナーの `countMismatch`（表示総件数と取得件数のずれ）と `errors` の増加が構造変化の兆候
- 壊れたら: 現行HTMLをフィクスチャとして追加 → テストが落ちることを確認 → パーサを修正 → `parserVersion` を上げる
- `listCompleted` が false の回は掲載終了の判定をしないこと

## Playwright の注意

クラウド開発環境では Chromium がプリインストールされている（`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`）。
`playwright` は 1.56.1 に固定している（Chromium rev 1194 に対応）。`playwright install` は実行しない。
