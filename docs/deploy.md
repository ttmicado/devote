# デプロイ手順（Vercel + Neon + Anthropic + GitHub Actions）

## 全体構成

| 役割 | サービス | 動くもの |
|---|---|---|
| Web（AIチャット・物件一覧・問い合わせ・管理画面・LINE Webhook） | **Vercel**（関数はシンガポール sin1。DB と同じ地域に置く） | `apps/web` |
| DB | **Neon**（PostgreSQL + pgvector、リージョンは AWS Singapore） | `packages/db` |
| AI | **Anthropic Claude API** | `apps/web/lib/ai.ts` |
| 巡回 → マッチング → 通知（30分ごと） | **GitHub Actions** | `.github/workflows/crawl.yml` |
| 通知 | LINE 公式アカウント（Messaging API）／ Resend（メール） | `packages/services/src/notify` |

巡回は Playwright（ブラウザ）を使います。Vercel の関数では実行時間とサイズの制限があるため、GitHub Actions で動かします。

---

## あなたにお願いしたい作業（上から順に）

### 1. Neon（DB）— Vercel の Storage から作成（推奨）
Vercel の画面から作ると、接続情報（`DATABASE_URL` など）が Vercel の環境変数に自動で入るので手間が減ります。

1. 先に手順 5 の Import まで済ませる（プロジェクトがあると紐づけが楽）
2. Vercel のプロジェクト → **Storage** → **Create Database** → **Neon** を選ぶ
   - Region: **Singapore（aws-ap-southeast-1）**（Vercel 経由の Neon には東京がないため）
   - Vercel の関数も `apps/web/vercel.json` でシンガポール（sin1）に固定している。1画面で DB に何度も問い合わせるので、
     関数と DB を同じ地域に置く方が、東京の関数から毎回シンガポールの DB に行くより速い
   - 環境: Production / Preview / Development すべてにチェック
3. 作成後、プロジェクトの Settings → Environment Variables に次が自動で追加される
   - `DATABASE_URL`（pooled 接続。アプリはこれを使う）
   - `DATABASE_URL_UNPOOLED`（直接接続。マイグレーションに使う）
   - そのほか `PG*` / `POSTGRES_*`（使わないが、そのままでよい）
4. GitHub Actions（手順 6）にも同じ値が必要なので、Neon のコンソール（Storage → 作成したDB → Open in Neon）の
   Connect から `DATABASE_URL`（pooled）と `DATABASE_URL_UNPOOLED`（direct）をコピーしておく

> 補足
> - 料金は Vercel の請求にまとまります（Vercel 経由の Neon。無料枠あり）。
> - Preview デプロイごとに Neon の DB ブランチ（本番データのコピー）が自動で作られます。本番に影響しないので便利ですが、
>   不要なら Neon 側の設定で無効にできます。
> - 直接 https://console.neon.tech で作っても構いません。その場合は接続文字列を手動で Vercel に登録します。

### 2. Anthropic（AI）
1. https://console.anthropic.com → API Keys でキーを発行する → `ANTHROPIC_API_KEY`
2. Billing でクレジットを入れる（会話1往復の目安は数円〜十数円。`DEVOTE_CHAT_EFFORT=low` にすると安く速くなります）

### 3. LINE 公式アカウント（フリープラン）
1. https://entry.line.biz で公式アカウントを作成する（プラン: コミュニケーションプラン＝無料、月200通まで）
2. LINE Official Account Manager → 設定 → Messaging API → **Messaging API を利用する**（プロバイダーを作成）
3. https://developers.line.biz/console/ で、作成されたチャネルを開く
   - チャネル基本設定 → **チャネルシークレット** → `LINE_CHANNEL_SECRET`
   - Messaging API設定 → **チャネルアクセストークン（長期）** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
   - Messaging API設定 → **Webhook URL** に `https://app.devote-inc.jp/api/line/webhook` を設定し、「Webhookの利用」をオン（手順 5 の後で設定）
   - 「応答メッセージ」「あいさつメッセージ」は Official Account Manager でオフにする（Devote が返信するため）
4. 友だち追加URL（`https://lin.ee/xxxx`）→ `NEXT_PUBLIC_LINE_ADD_FRIEND_URL`

> フリープランは月200通です。Devote は1回の通知を1通（カルーセル）にまとめて送ります。上限に達するとメールに切り替わります。
> 利用者が増えたらライトプラン（月5,000円・5,000通）への変更を検討してください。

### 4. Resend（メール）
1. https://resend.com でアカウントを作成する → API Keys → `RESEND_API_KEY`
2. Domains → Add Domain で **`mail.devote-inc.jp`** を追加し、表示される DNS レコード（MX / SPF の TXT / DKIM の TXT）を
   devote-inc.jp の DNS（お名前.com 等、ドメインを管理しているサービス）に登録する → Verify
   - 送信専用のサブドメインにしておくと、会社のメール（@devote-inc.jp）の到達率に影響しません
3. `MAIL_FROM` = `Devote <noreply@mail.devote-inc.jp>`
4. （推奨）DMARC: `_dmarc.mail.devote-inc.jp` に TXT `v=DMARC1; p=none;` を追加

### 5. Vercel（Web）
1. https://vercel.com/new で GitHub リポジトリ `ttmicado/devote` を Import する
2. **Root Directory を `apps/web`** にする（Framework は Next.js が自動で選ばれます）
3. 手順 1 の Storage → Neon をここで作成する（`DATABASE_URL` が自動で入る）
4. Environment Variables に以下を設定する

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | （Storage から Neon を作れば自動で入る） |
| `APP_URL` | `https://app.devote-inc.jp` |
| `SESSION_SECRET` | ランダムな32文字以上（`openssl rand -base64 32`） |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 管理画面のID・パスワード |
| `ANTHROPIC_API_KEY` | 手順2 |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | 手順3 |
| `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` | 手順3 |
| `NEXT_PUBLIC_LINE_OA_ID` | 公式アカウントのベーシックID（例: `@123abcde`）。設定するとLINE連携がワンタップになる |
| `RESEND_API_KEY` / `MAIL_FROM` | 手順4 |

5. Deploy
6. Settings → **Domains** で **`app.devote-inc.jp`** を追加し、表示される DNS レコード
   （`app` の CNAME → `cname.vercel-dns.com` など、画面の指示どおり）を devote-inc.jp の DNS に登録する
7. LINE の Webhook URL に `https://app.devote-inc.jp/api/line/webhook` を設定し、「検証」で成功することを確認する

### 6. GitHub（巡回・マイグレーション）
リポジトリ → Settings → Secrets and variables → Actions

**Secrets**（New repository secret）

| 名前 | 値 |
|---|---|
| `DATABASE_URL` | Neon の pooled 接続文字列（手順 1-4） |
| `DATABASE_URL_UNPOOLED` | Neon の direct 接続文字列（マイグレーション用） |
| `APP_URL` | `https://app.devote-inc.jp` |
| `SESSION_SECRET` | Vercel と**同じ値**（通知のリンクから開いたときに本人を引き継ぐ署名に使う） |
| `LINE_CHANNEL_ACCESS_TOKEN` | 手順3 |
| `RESEND_API_KEY` / `MAIL_FROM` | 手順4 |
| `REINS_USER_ID` / `REINS_PASSWORD` | レインズ |
| `ATBB_USER_ID` / `ATBB_PASSWORD` | ATBB |
| `ITANDI_EMAIL` / `ITANDI_PASSWORD` | ITANDI BB |

**Variables**（任意）
- `ENABLE_MEMBER_SOURCES` = `0` … 会員サイト（レインズ・ITANDI BB）の巡回を止める（空なら巡回する。弊害が出たときの停止スイッチ）
- `ENABLE_UNVERIFIED_SOURCES` = `1` … 動作確認前のアダプター（現状 ATBB）も巡回する（確認が済むまでは空のまま）
- `DEVOTE_SOURCES` … 巡回するソースを絞る（例: 会員サイトは国内マシンで動かす場合）
- `REINS_MONTHLY_SEARCH_LIMIT` / `REINS_MONTHLY_DETAIL_LIMIT` … レインズの巡回の月間上限（既定 4,500。無料枠 6,000 は人の利用と共有。
  超えた分は1件3円）

その後:
1. Actions → **DB Migrate** → Run workflow（Neon にテーブルを作る。以後 main へのマージで自動実行）
2. Actions → **Crawl & Notify** → Run workflow（初回の巡回。以後30分ごとに自動実行）
3. `https://app.devote-inc.jp/admin` で「巡回ソースの状況」に結果が出ることを確認する

### レインズの利用上限について
レインズは月間の検索・物件詳細検索・図面がそれぞれ **6,000 件まで無料、超えた分は1件3円**（ミカド社確認）のため、
Devote は無料枠の範囲に収まるよう次のように制御します。
- 無料枠は会社単位で人の利用と共有のため、巡回は月 4,500 件を上限に、**月末までの残り日数で日割り**して使う（例: 月初は1日約145件まで）
- 提供時間（7:00〜23:00）のみ巡回。検索範囲はユーザーの希望条件（エリア・予算・広さ・間取り）から作り、希望条件がなければ巡回しない
- 期間は件数事前確認で500件に収まる最も広い期間（全期間〜当日）。一覧のページ送りは利用量に数えない（検索1回＝1件）
- 件数事前確認（無課金）で 0件なら一覧を開かない
- 実際に行った検索・詳細表示の回数は `source_usage` に記録し、管理画面の「今月の利用量」に表示

### 7. 会員サイト（レインズ・ATBB・ITANDI BB）の認証情報を Claude に渡す
ログイン後の画面構造を確認してアダプターを仕上げるため、**この開発環境（Claude Code on the web）にも**認証情報が必要です。
claude.ai/code の環境設定 → 環境変数 に `REINS_USER_ID` などを登録してから、新しいセッションで
「会員サイトのアダプターを仕上げて」と依頼してください。詳しくは `docs/member-sites.md` を参照してください。

> チャットに ID・パスワードを直接書き込まないでください。

---

## 動作確認の流れ（身内テスト）
1. `https://<URL>/chat` で AI と条件を相談する → 「この条件で通知を受け取る」
2. `/settings` で LINE 連携（友だち追加 → コード発行 → コードをトークに送る）またはメール登録
3. 頻度を「すぐに」にして、次の巡回（30分ごと）で通知が届くことを確認する
4. 届いた物件から「内見を問い合わせる」→ `/admin` に表示されることを確認する
5. `/admin` で状態を「対応不可」にする → 類似物件の候補が表示される → 選んで送信 → お客様に届く

## ローカル開発
```bash
pnpm install
cp .env.example .env        # 値を入れる
pnpm db:up && pnpm db:migrate
pnpm dev                    # http://localhost:3000
pnpm worker crawl rf12      # 1ソースだけ巡回
pnpm worker all             # 巡回 → マッチング → 通知
```
