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
| `kencorp` | ケン・コーポレーション（賃貸＋売買＋事業用賃貸） | 一覧は内部JSON API（事業用は `search_type=office`、賃料「相談」は除外）、詳細はSSR |
| `stepon` | 住友不動産ステップ（賃貸） | HTTP（SSR・Shift_JIS）。区ごとのマンション検索＋戸建ての1検索 |
| `livable` | 東急リバブル（賃貸） | HTTP。一覧・詳細とも `__NEXT_DATA__` の pageProps を JSON にして読む |
| `mitsui-chintai` | 三井の賃貸（三井不動産レジデンシャルリース） | HTTP（SSR）。建物→空室。写真は `/rf/photo/{建物}/{部屋}` の JSON |
| `mec-h` | 三菱地所ハウスネット（賃貸） | HTTP（SSR）。建物→空室 |
| `reins` / `atbb` / `itandi-bb` | 会員サイト | Playwright（未検証。`docs/member-sites.md`） |

区単位でしか検索できないサイトで中央区勝どき・晴海、江東区豊洲を巡回するときは、一覧URLのフラグメント（`#towns=勝どき`）で
町名を渡し、パーサが一覧の所在地で絞る（`src/town-filter.ts`）。対象外の物件は取り込まれないので、一覧で落とさないと毎回詳細を取り直すことになる。

## レート制御・マナー

- `rateLimit.minIntervalMs` はデフォルト 2000ms 以上。会員サイトは `maxConcurrency: 1`
- 429/5xx はフェッチャーが指数バックオフで再試行する。404/410 は掲載終了の候補
- 画像は詳細のURLだけ保持し、巡回時にダウンロードしない
- 他社の社名・ロゴ（透かし含む）が入った写真は使わない。そういう写真のサイトは `registry.ts` の `noImageSourceIds` に入れる（取り込み時に写真を外し、取り込み済みの写真も消す）。透かしを消す・切り取る加工はしない

## 会員サイト（レインズ、ATBB 等）

- 認証情報は `.env`（`REINS_USER_ID` 等）から読み、**コードやフィクスチャにID/パスワードを書かない**
- `login()` と `isLoggedOut()` を実装する。2FA・CAPTCHA が出たら自動で突破しようとせず、エラーにして人に知らせる
- 1アカウントにつき同時実行1

## 構造変化への対応

- ランナーの `countMismatch`（表示総件数と取得件数のずれ）と `errors` の増加が構造変化の兆候
- 壊れたら: 現行HTMLをフィクスチャとして追加 → テストが落ちることを確認 → パーサを修正 → `parserVersion` を上げる
- `listCompleted` が false の回は掲載終了の判定をしないこと
- ブロック・チャレンジページ（Cloudflare 等の WAF、海外IP制限）は 200 で返ることがあり、そのままパースすると「0件」になる。
  ランナーは一覧・詳細の本文を `detectBlockPage`（`src/block.ts`）で判定し、一覧なら警告＋`listCompleted=false`、
  詳細なら errors に「ブロック・チャレンジの可能性」と記録する（3回続いたらその回の詳細取得を打ち切る）。
  `fetchList` / `fetchDetail` を自前で実装するアダプターも、取得直後に `detectBlockPage` で判定して throw する
- 0件のクエリ・全体で0件の回は `CrawlResult.warnings` に出る。インデックス→個別ページを束ねるアダプターは、
  インデックスの構造（リンク）が取れないときは「空室0」と区別してエラーにする（例: 住友不動産の `countBuildingLinks`）
- バッチのログの `inArea` / `newCount` は「今回詳細を取得した物件」の数。一覧の `listHash` が前回と同じ物件は
  詳細を取得しないので、変化が無い回は 0 になるのが正常（`seen` と `unchanged` で確認する）

## Playwright の注意

クラウド開発環境では Chromium がプリインストールされている（`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`）。
`playwright` は 1.56.1 に固定している（Chromium rev 1194 に対応）。`playwright install` は実行しない。
