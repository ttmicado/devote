# 会員制の業者間サイト（レインズ / ATBB / ITANDI BB）の自動化メモ

2026-10-13 に認証情報なしで調べ（§1〜§4 はその時点の内容）、**2026-10-14 にログイン後の実画面で確認した（§0）**。
レインズ・ITANDI BB は `VERIFIED = true`・`parserVersion: "1"`。ATBB は同じIDを人が使用中で検索画面に入れず未確認（`VERIFIED = false`）。
**2026-10-14 から GitHub Actions で運用する**（人と同じIDのまま。弊害が出たら GitHub の Variables に `ENABLE_MEMBER_SOURCES=0` を入れて止める）。

## 0. 2026-10-14 の実画面での確認結果

確認は Claude Code on the web（米国 GCP の IP、ヘッドレス Chromium＋通常の Chrome UA）から `explore.ts` で行った。
3サイトとも**米国 IP・ヘッドレスからログインでき、追加認証・CAPTCHA・端末確認は出なかった**。

### レインズ（確認済み）
- ログイン → メインメニュー（`/main/KG/GKG003100`）。【賃貸 物件検索】→ 検索条件入力（賃貸 `/main/BK/GBK001310`、売買 `GBK001210`）
- 画面はすべて JSON API で描画される（`POST /main/api/<画面ID>/...`）。アダプターは画面を操作し、API の応答を横取りする
  - 件数事前確認: `.../getBkknDataCount` → `{ count }`（**無課金**）。結果はダイアログ「件数事前確認結果」（キャンセル／検索）
  - 一覧1ページ目: `.../GBK002200/getInitDataFromKnskJyukn`（売買は `GBK002100`）。`bkknKnskListResultData1.knskResultList`（50件）と `knskResultListKnsu`（総件数）
  - 一覧2ページ目以降: `.../getBkknListData`（ページボタン "Go to page N"）
  - 詳細: 一覧の行（`.p-table-body-row`）の【詳細】→ `/main/BK/GBK003200`（売買 `GBK003100`）。`.p-label-title` と同じ `.col` 内の値を読む
  - 詳細からブラウザの「戻る」で一覧の同じページに戻る。**一覧の API は再度呼ばれない**（再検索にならない）
  - 物件番号検索（`GBK004100`）は物件番号を最大20件まとめて検索できる（未使用）
- 期間の絞り込み: 「その他検索項目(在庫のみ)」の 登録年月日 / 変更年月日（いずれかに一致）に「当日」「前日」「３日以内」…がある
- 実測件数（港区・賃貸マンション、10/14 8:40）: 全期間 3,112件 / 3日以内 1,050件 / 前日 538件 / 当日 151件。
  **検索で表示できるのは500件まで**なので、既定は「当日」（9時前は「前日」）の差分検索（`REINS_SEARCH_PERIOD` で変更可）。
  差分なので一覧に出ないことを掲載終了とみなさない（`meta.incrementalList`）
- 件数事前確認が0件なら【検索】しない（一覧表示＝課金を避ける）
- 詳細は表示中の一覧ページからしか開けないため、ランナーは一覧1ページごとに詳細を取る（`meta.detailsAfterEachListPage`）
- 写真は `<img>` ではなく認証付き API（`/main/api/KG/GKG010100/findBkknGzu?...`）。公式に「保存できません」とあるので**取得しない**（`imageUrls: []`）
- ログイン画面の「規程及びガイドラインを遵守します」チェックが画面の再描画で外れることがある（未チェックで送ると 401＝ログイン失敗1回）。
  チェック済みを確認してから送信する。ログアウト後の古いセッションファイルは消す
- ログアウト: 右メニューの「ログアウト」→ `/logout/main/KG/GKG002100`（件数事前確認のダイアログが開いていると押せない）
- 利用実績（Myレインズ「利用実績照会」）は**前日までの集計**。当月（10/1〜13）の人の利用は 物件検索 376件・物件詳細 263件・図面 480件。
  **無料枠 6,000件は会社単位で人と共有**なので、巡回の既定上限は月 4,500件にした。
  ページ送り（`getBkknListData`）が「物件検索」1件に数えられるかは、翌日以降に利用実績照会で確認すること
- 確認に使った量（10/14）: 件数事前確認 約8回、検索 6回（うちページ送り1回）、物件詳細 9件

### ATBB（未確認: 人が使用中）
- ログイン（`atbb.athome.jp` → `members.athome.jp/login`）→ ポータル `https://members.athome.jp/portal`（加盟店専用サイト）。ログインは成功
- 保存済みセッションの確認はポータルを開いて行う（`atbb.athome.jp` はログイン中でもログイン画面を出す）
- 流通物件検索はヘッダー「物件・会社検索」のメニュー項目 `data-action="/atbb/nyushuSearch?from=global_menu_bukkenKensaku"`（別タブ）
- それを開くと `atbb.athome.co.jp/front-web/login/ConcurrentLoginException.jsp` に飛ばされた＝**同じIDで別の端末が ATBB を使用中**（FAQ No.186 の同時ログイン不可）。
  人の作業を奪わないよう、アダプターはこの画面でエラーにして止める。ポータルからはログアウトした
- 次にやること: **巡回専用の追加ID** を発行してもらい（または人が使っていない時間帯に）、`explore.ts atbb` で検索条件入力〜一覧〜詳細を確認する

### ITANDI BB（確認済み）
- ログイン（`itandi-accounts.com/login`）→ `itandibb.com/top`。賃貸のリスト検索 `/rent_rooms/list`
- 所在地は「所在地で絞り込み」のモーダルで都道府県→市区町村を選ぶ（たたき台の操作で動いた）
- `POST /api/internal/v4/rent_room_buildings/search` は条件を変えるたびに**該当件数だけの呼び出し（buildings が空）**が走る。
  一覧の応答は buildings が入っているものを待つ
- 一覧: 1ページ20棟。`total_count` は棟数（港区 1,103棟）、`room_total_count` は部屋数（1,939室）。部屋の ID は `property_id`
- 既定の並びは**募集条件の更新が新しい順**（先頭が「6分前」…）。全件（港区で56ページ）は回らず、
  更新が1日以内の部屋があるページだけ・最大5ページまで送る（`MAX_PAGES`）。差分なので掲載終了の判定はしない
- 詳細: `/rent_rooms/{id}` を開くと `GET /api/internal/v4/rent_rooms/{id}` の JSON。住所は `address.text`、構造は `structure_type`（"鉄筋コンクリート"）、
  取引態様は `deal_type`（"貸主" 等）、採光は `main_lighting_direction_type`（"東向き"）、広告は `advertisable_type`（"unspecified" 等）
- 写真は `https://property-images.itandi.co.jp/public/images/...`（**cookie なしの公開 URL**）
- ログアウト: 右上の会社名メニュー内の「ログアウト」ボタン
- 巡回は 9〜21時・4時間以上空けて（1日3回程度）。運営の注意喚起（§4）があるため、件数・頻度はこれ以上増やさない

### 運用方針（2026-10-14 決定）
1. 実行環境: **GitHub Actions**（米国 IP・毎回ログイン）。米国 IP からのログインは3サイトとも通った
2. ID: **人と同じIDのまま**。弊害（ログイン停止・不正検知・人の作業中のセッション切れ等）が出たら巡回専用IDを検討する
3. ITANDI BB: 運営の注意喚起（§4）は承知のうえで**運用する**。頻度・件数は1日3回・1検索最大5ページに抑える
4. ATBB: 9:20 に再確認しても同じIDが使用中で未確認。未検証のため巡回対象外（人が使っていない時間帯に `explore.ts atbb` で仕上げる）
5. 止めるとき: GitHub の Variables に `ENABLE_MEMBER_SOURCES=0`（`DEVOTE_SOURCES` で一部だけにもできる）
6. ログイン失敗時: 前回の巡回がログイン系の失敗（ログイン失敗・追加認証・同時ログイン・セッション切れ）なら、
   **24時間は再ログインしない**（`packages/pipeline/src/login-hold.ts`）。30分ごとの再試行でアカウントがロックされるのを防ぐ
7. 弊害の見張り: 管理画面「巡回ソースの状況」の失敗（ログイン失敗・セッション切れ）と、Myレインズ「利用実績照会」の件数

## 1. まとめ

| | レインズ | ATBB | ITANDI BB |
|---|---|---|---|
| ログインURL | https://system.reins.jp/login/main/KG/GKG001200 | https://atbb.athome.jp/ （POST先 https://members.athome.jp/login） | https://itandibb.com/ → https://itandi-accounts.com/login |
| 認証方式 | ユーザID（12桁）＋パスワード（最大12桁）＋「規程・ガイドライン遵守」チェック必須 | ID＋パスワード | メールアドレス＋パスワード（初回登録だけ店舗代表電話での電話認証） |
| 2段階認証 | 見当たらない（ログイン画面のJSに認証コード入力の処理なし） | 見当たらない（FAQにも記載なし） | 見当たらない（ヘルプにも記載なし） |
| CAPTCHA / ボット対策 | HTML に reCAPTCHA Enterprise の sitekey と CSP の許可あり。ただし現行のログイン画面では読み込まれていない。**UA に `HeadlessChrome` を含むと 503** | 不正アクセス検知の計測タグ（fraud-alert.net）。user_uuid をセッションIDとして送っている | 未確認（Cloudflare 系の可能性。ヘルプセンターは Bot チェックで 403 になった） |
| 端末認証 | 見当たらない | 見当たらない（ただし挙動ベースの不正検知はある） | 見当たらない（ヘルプ「スマートフォンや社外のパソコンでログインできますか？」→可能） |
| IP制限 | 米国（GCP）の IP からトップ・ログイン画面は 200 で表示できた。ログイン後は未確認 | 米国 IP からログイン画面は表示できた。ログイン後は未確認 | 米国 IP からログイン画面は表示できた。ログイン後は未確認 |
| 同時ログイン | 未確認（ログイン処理に「既存セッション」の分岐がある） | **同一IDの同時ログイン不可**（FAQ No.186） | 未確認 |
| 提供時間 | **7:00〜23:00**（12/28〜1/3 休止） | 未確認 | 未確認 |
| 取得方式 | SPA（Nuxt）。画面操作→HTML | 従来型の HTML（jQuery）。画面操作→HTML。別ウィンドウが開く可能性 | SPA（React）＋ JSON API。画面操作→**API の JSON を横取り** |
| 費用 | **月間 6,000 件まで無料、超過分は1件3円**（検索・物件詳細・図面それぞれ。下記） | 加盟店契約に含まれる想定（未確認） | 基本無料。写真購入は 3,300円/物件（使わない） |

## 2. レインズ（東日本レインズ IP型 = 4機構共通システム）

### 調べたこと
- 2022年1月から4機構（東日本・中部・近畿・西日本）が単一システムを共同利用。画面は旧「全国データベース」ベース。
  ログイン ID は12桁、物件番号は12桁。
- ログイン画面（実物）: Nuxt の SPA。`ユーザID` `パスワード` `ユーザID・パスワードを保存する` `所属機構の規程及びガイドラインを遵守します`（チェックしないとログインボタンが disabled）。
- ログイン処理（公開 JS）: `POST main/api/login` → `localStorage` に `mainAccessTokenExpiresIn` / `mainRefreshToken` / `mainRefreshTokenExpiresIn` を保存 → `POST main/api/KG/GKG001200/testNextPage` の `redirectPath` へ遷移。
  トークンは `POST main/api/refresh_token` で更新。リフレッシュトークンの期限は「当日の終わり」（`endOf("day")`）なので**セッションは日をまたいで使えない見込み**。
  Playwright の storageState は localStorage も保存するので、同日中なら保存セッションで再ログインを省ける見込み。
- **HeadlessChrome の UA は 503**。アダプターの `applyBrowserProfile()` で通常の Chrome UA に差し替えている（`browser.ts` に UA 指定のオプションを足すのが本来の形）。
- 画面ID: 共通 `GKG*`、物件系 `GBK*`（例 `/main/BK/GBK001100` …）。メニュー名と画面IDの対応はログイン後にしか分からない。

### 画面フロー（公開マニュアル: 近畿レインズ「新システム クイックマニュアル」2021/10 v1.0 より。4機構共通）
1. メインメニュー: 【売買 物件検索】【賃貸 物件検索】【物件番号検索】【会員検索】、Myレインズ（利用実績照会・精算履歴照会 等）
2. 検索条件入力: 「物件種別１」と「所在地 / 沿線 / バス路線 / その他交通」のいずれかが必須。
   - 物件種別は2つまで、種目は種別ごとに2つまで。賃貸の物件種別は 賃貸土地/賃貸一戸建/賃貸マンション/賃貸外全/賃貸外一、売買は 売土地/売一戸建/売マンション/売外全/売外一（表記は要確認）
   - 所在地は「通常の選択」を3条件まで。都道府県 → 所在地名１（市区町村）→ 所在地名２（町丁目）。入力ガイドを使わず直接入力も可。
     所在地名２の「〇丁目」を消すと町全域、一部を消すと部分一致になる
   - 「その他検索項目」で **登録年月日 / 変更年月日（例: 3日以内）** を指定できる → 差分巡回に使える
   - 【件数事前確認】でヒット件数を確認できる（**課金されない**）。【検索】で一覧表示（**表示された時点で課金**）。**最大500件**
   - 検索条件は売買・賃貸それぞれ50件まで保存可（ワンタッチ検索）。マッチング条件は20件まで、結果は翌日から
3. 検索結果一覧: 物件種別ごとのタブ、ページ移動、並べ替え、各行に【詳細】、会員名（商号）表示切替。
   チェックした物件の**図面を最大20件まで1つのPDFで【図面一括取得】**（20件超はエラー）
4. 物件詳細: 全項目が表示される。**画像（最大10点）は物件詳細でのみ閲覧可、「プリントアウト・保存はできません」**と注意書き。図面は1物件1点（PDF/JPEG/GIF/TIFF）
5. 物件番号検索: 12桁の物件番号で直接開ける

### 費用（要確認・重要）
近畿レインズのマニュアルは「利用料金は物件検索等の利用回数に応じた従量課金」「検索結果が表示された時点で課金」と明記。
**ミカド社の確認（2026-10）: 月間で検索・図面・物件詳細検索はそれぞれ 6,000 件まで無料、超過分は1件3円。**
→ アダプターの `meta.monthlyQuota` で月 6,000 件を上限とし、`packages/pipeline/src/quota.ts` が月末までの残り日数で日割りして
1回の巡回で使える件数を決める（利用量は `source_usage` に記録、管理画面に表示）。提供時間 7〜23時・2時間ごとに巡回。
アダプターは 2種別（賃貸・売買）× 6エリア = 12検索/回。詳細は物件番号検索で開く実装なので、これも課金対象なら「一覧表示中の行から【詳細】」に寄せる。

### 画面に書かれている注意（ログイン画面より）
「レインズから取得した物件情報を、元付業者の承諾なく、自社のホームページへ掲載したり…広告掲載や宣伝告知を行うことは禁止」
「元付業者から承諾を得ても…そのまま転載すれば…公正競争規約違反として措置を受けるおそれ」。
→ 通知の文面・画像の扱い（エンドユーザーにそのまま見せるか、物件の存在と条件だけ伝えて問い合わせに誘導するか）はプロダクト側で決める。

## 3. ATBB（アットホーム）

### 調べたこと
- ログイン画面（実物）: `form[name=Frm_AtbbLogin]` → `POST https://members.athome.jp/login`。
  `loginId` `password` と hidden の `div=kameiten`（加盟店専用サイト）`user_uuid` `fromUrlParam`。
  送信ボタンは JS が 0.2秒ごとに ID/パスワードの入力を見て有効化する。
- `user_uuid` は `https://members.athome.jp/uuid` から取得し、不正アクセス検知サービスの計測タグ（`static.fraud-alert.net`）にセッションIDとして渡している。
  → **ログイン時の端末・挙動が監視されている前提**で、海外IP・ヘッドレスブラウザからのログインが不審判定される可能性がある。
- FAQ（faq.athome.jp, site_domain=atbb）:
  - No.186「ひとつのＩＤで複数のパソコンへ同時にログインできますか？」→「**同一のＩＤでは同時にログインできません**。複数のパソコンで利用したい場合は、違うＩＤを設定」（追加IDあり）
  - 「セッションタイムアウトやATBBを終了しましたと表示されます」という FAQ がある → `isLoggedOut` で拾う
  - パスワードは英数8〜12桁
- 検索（紹介記事・プレスリリースより）: ダイレクト検索（住所・交通・ランドマーク）/ 都道府県からの所在地検索 / 地図検索 / 路線図 / 沿線 / フリーワード。
  詳細では間取り・写真・図面（ファクトシート）。元付が設定した広告転載区分「転載可・転載不可・要確認」がある。
  市販の RPA（ATBB物件検索ロボット等）が「ログイン → 登録済み条件で検索 → 物件データ・元付図面・自社帯図面・物件詳細（画像付き）をリスト化」を行っているので、画面操作での取得自体は一般的。

### 画面フロー（推測。要確認）
ログイン後トップ → 「物件検索（流通物件）」→ 種目（賃貸居住用 / 売買居住用）→ 所在地から探す → 東京都 → 市区町村チェック（→ 町名）→ 条件 → 検索 → 一覧 → 詳細（別ウィンドウの可能性）→ 図面

### 写真・図面
詳細の `<img>` を控える。画像 URL は cookie 必須の可能性が高い → 取り込み時に同じブラウザコンテキストで取得して Vercel Blob に再アップロードし、その URL を `imageUrls` に入れる。
図面（元付帯/自社帯）の出力方式（PDF ダウンロード or 画像の別ウィンドウ）は未確認。

## 4. ITANDI BB

### 調べたこと
- `https://itandibb.com/` は React の SPA。未ログインだと `itandi-accounts.com/login`（Rails。`client_id=itandi_bb` の OAuth 風）にリダイレクト。
  「2回目以降ログイン」フォーム: `email` `password` `authenticity_token`。他に「ラビーネットでログイン」（全日の会員向けSSO）。
  初めての店舗は「代表電話認証」（宅建業者登録の代表電話から発信）でアカウント作成。
- データは JSON API（`https://api.itandibb.com/api/internal/...`、cookie 認証。未ログインで `sessions/authenticate` が 401）:
  - 一覧（部屋）: `POST /api/internal/v4/rent_room_buildings/search`、filter 例 `"address:in"`（所在地。JGDC コード）、`rent:gteq/lteq`、`room_layout:in`、`station_walk_minutes:lteq`、`offer_advertisement_reprint_available_type:in` 等。
    レスポンスの外形は `{ buildings: [{ ..., rooms: [...] }], total_count, room_total_count }`
  - 詳細: `GET /api/internal/v4/rent_rooms/{id}`（画面は `/rent_rooms/{id}`）
  - 物件資料PDF（仲介帯/管理帯）: `/api/internal/rent_residential_rooms/{id}/brokerage_company_obi_document` 等
  - 売買: `sale_room_buildings` 等もある
  → アダプターは画面を操作し、発生した API レスポンスを `page.waitForResponse` で横取りして JSON をパースする。
- ヘルプ（公開 Zendesk）より:
  - 検索: Home → 賃貸/売買の「リスト検索」→ 左の検索画面に条件 → 検索。建物表示は1ページ20棟、簡易表示は1ページ最大100件、部屋表示あり。並び順は募集開始日 等
  - 物件資料: 一覧・詳細の「物件資料」→ 出力パターン（仲介帯/管理帯/両方）と写真レイアウトを選んで「PDFを出力」（`物件名 部屋番号.pdf`）。仲介帯には「設定 → 図面・見積書設定」の会社情報が必須
  - 写真購入（Live Search）: 1物件 3,300円の従量課金 → **使わない**
  - 2026-09-09: 入居可能時期での検索追加、2026-08-12: リスト検索画面のデザイン変更（構造変化が頻繁）
- **重要: ヘルプ記事「【重要】『ITANDI BB』の安全なご利用とデータ取得に関するお願い」**（2026年）で、
  「自動プログラム（クローリングやスクレイピングなど）を用いて…情報を大量に取得」する行為は ITANDISYSTEM 利用規約 第27条でお控えいただくよう求めており、
  そうしたシステム事業者の情報提供を呼びかけている。運営は検知・アカウント停止に動く可能性が高い。
  （法的検討は不要との指示なので評価はしない。**運用上のリスク**として記録する）
  → アダプターは間隔 8秒・1日3回・賃貸6エリアに抑えている。導入前に、運営への問い合わせ（公式連携の有無）か、頻度・件数のさらなる制限を判断すること。

## 5. 認証情報が入ったら次にやること

`.env`（リポジトリ直下、コミットしない）に設定:

```
REINS_USER_ID=...
REINS_PASSWORD=...
ATBB_USER_ID=...
ATBB_PASSWORD=...
ITANDI_EMAIL=...
ITANDI_PASSWORD=...
```

1サイトずつ、人がブラウザでそのサイトを使っていない時間帯に:

```
node --env-file=.env --import tsx packages/scraper/src/explore.ts reins --precheck-only --logout   # 件数事前確認だけ（無課金）
node --env-file=.env --import tsx packages/scraper/src/explore.ts reins --query=rent-中央区勝どき --max-count=20 --details=2 --logout
node --env-file=.env --import tsx packages/scraper/src/explore.ts reins --headed --logout
# または: set -a; . ./.env; set +a; npx tsx packages/scraper/src/explore.ts reins --headed --logout
```

- 主なオプション: `--precheck-only`（レインズ: 件数事前確認で止める）、`--max-count=N`（事前確認が N 件超なら検索しない。既定100）、
  `--query=KEY`、`--details=N`、`--pages=N`、`--pick=I,J`、`--usage`（レインズの利用実績照会）、`--logout-only`
- 出力: `storage/explore/<source>/`（各ステップのスクショ＋HTML、`network.jsonl`＋API レスポンス JSON、`explore.log`、`list-body.*`、`detail-*.json`）。セッションは `storage/sessions/<source>.json`
- 失敗したステップはその時点の画面を `*-failed.png/html` で保存する。ログイン失敗は即終了（**連続で試さない。アカウントロック防止**）
- 確認する順番:
  1. `after-login`: 追加認証・端末確認・お知らせ同意画面が出ていないか。出たら自動突破せず人が対応し、その仕様を記録
  2. `search-form` / `search-filled`: ラベル・入力要素・ボタンの実際の表記 → `// TODO(verify):` のセレクタを直す
  3. `list`: 行の構造・物件番号・価格・ページ送り・総件数の表記 → `parseList` を直す。一覧2ページ分を `__fixtures__/` に保存（会員名・担当者名・電話番号はマスク）
  4. `detail-*`: 項目名と値 → `normalize` の項目名を直す。詳細3件以上をフィクスチャに保存
  5. 写真の URL（cookie なしで取れるか、期限付きか）、図面の取得方法（PDF ダウンロード）を確認
  6. レインズ: Myレインズの利用実績・精算履歴で課金の有無を確認
  7. テストを実データのフィクスチャで書き直し、`VERIFIED = true`・`parserVersion: "1"` にして `registry.ts` に登録
- `--logout` を付けないとセッションを残す（同日中の再実行が速い）。ATBB は同時ログイン不可なので、人が使う前に必ずログアウトするか、**巡回専用の追加ID**を使う

## 6. 自動化で気をつけること

- **同時ログイン**: ATBB は同一ID不可。レインズ・ITANDI も、人の操作と巡回でセッションを奪い合う可能性がある → 巡回専用ID（追加ID/担当者アカウント）を用意する。`maxConcurrency: 1` 固定
- **セッション切れ**: レインズはトークン（リフレッシュトークンは当日限り）。ATBB は「セッションタイムアウト」画面。ITANDI は API が 401。
  `isLoggedOut` / 401 で検知したらランナーが止まる → 再ログインは1回だけ、失敗したら通知して人が見る
- **ログイン失敗を繰り返さない**: パスワード誤りでロックされる。失敗時は即停止し、自動リトライしない
- **2FA・CAPTCHA・追加認証**: 出たら自動突破しない（アダプターはエラーにする）
- **提供時間**: レインズは 7:00〜23:00 のみ
- **負荷と課金**: 最小間隔はレインズ/ATBB 5秒、ITANDI 8秒。レインズは件数事前確認（無課金）で 500件超を検知し、登録年月日/変更年月日で差分検索に寄せる
- **構造変化**: ITANDI は画面改修が頻繁（2026年だけで検索画面のデザイン変更・項目追加が複数回）。API の JSON を使う方が HTML より壊れにくい
- **生データの保存**: 会員サイトの HTML・スクショには他社の会員情報・担当者情報が含まれる。`storage/` はコミットしない。フィクスチャはマスクしてから入れる

## 7. GitHub Actions（米国IP）から動くか

**見込み: ログイン画面までは表示できる。ログイン後の挙動は未確認で、本番運用は国内IPのセルフホストを推奨。**

- このセッションの出口 IP は米国（Google Cloud, South Carolina）。この IP から3サイトともログイン画面は表示できた（レインズは UA を通常の Chrome にした場合のみ 200）。明示的な国別ブロックはログイン画面の段階では無い
- ただし:
  - レインズは reCAPTCHA Enterprise を用意している（現状ログイン画面では未使用）。有効化されるとデータセンターIPは低スコアになりやすい
  - ATBB は不正アクセス検知（端末・挙動ベース）を入れており、**海外のデータセンターIP＋毎回新しいブラウザ**のログインは不審判定されやすい
  - GitHub Actions は実行ごとに IP が変わり、storageState を持ち越すには secrets/artifacts に暗号化して置く必要がある
  - 会員サイトの不正検知で ID が止まると業務（人の利用）にも影響する
- 代替案（推奨順）:
  1. **国内のセルフホストランナー**: 事務所の常時稼働PC（または自宅PC）に GitHub Actions self-hosted runner を入れる。IP が普段の業務と同じで、セッションファイルもローカルに置ける。
     Playwright の Chromium だけ入れればよい。夜間停止・スリープに注意
  2. **国内 VPS**（さくら・ConoHa・AWS 東京リージョン等）に self-hosted runner。IP は固定だがデータセンターIPではある
  3. GitHub Actions（米国）＋国内のプロキシ経由 … 構成が複雑になるので非推奨
- まずは explore を国内の端末で実行して挙動を確認し、その後に同じ explore を GitHub Actions 上で1回だけ（ログイン画面まで＝認証情報なしで）流して 503/403 にならないかを見る、という順で判断する

## 8. 出典

- レインズ ログイン画面（実物）: https://system.reins.jp/login/main/KG/GKG001200 、サポート環境 https://system.reins.jp/public/GKG000270.html
- 近畿レインズ「新システム クイックマニュアル」（全日本不動産協会のセミナー資料, 2021/10）: https://movie.zennichi.or.jp/wp-content/uploads/2022/01/zmovieneo_seminar_reins_kinnki_resume_quick.pdf
- 西日本レインズ「4機構共通レインズシステムに変わります」: https://www.nishinihon-reins.or.jp/wp/wp-content/themes/rcnt/images/pdf/change-point.pdf
- 中部レインズ 会報誌 第100号（ワンタッチ検索・マッチング）: https://www.chubu-reins.or.jp/reinspdf/data/kh83_kaihoushi.pdf
- ATBB ログイン画面（実物）: https://atbb.athome.jp/ 、FAQ: https://faq.athome.jp/faq/show/186?site_domain=atbb ほか（site_domain=atbb）
- ATBB 紹介: https://www.facilo.jp/blog/atbb-bukkenkensaku-kokyakukanri/ 、https://www.athome.co.jp/corporate/news/release/services/atbb-chizukensaku-202011/ 、ATBB物件検索ロボット https://www.ipros.com/product/detail/2000765651/
- ITANDI BB ログイン画面（実物）: https://itandi-accounts.com/login 、公開 JS: https://assets.itandibb.com/assets/
- ITANDI BB ヘルプ（Zendesk 公開 API で取得）: 物件検索画面 /hc/ja/articles/5981817771539、社外からログインする方法 /7059527335315、
  安全なご利用とデータ取得に関するお願い /54981297494675、物件資料自動作成 /45630140691091、写真購入 /55736347674387
  （ベース https://itandibb-broker.support.itandi.co.jp/hc/ja/articles/）
