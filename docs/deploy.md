# デプロイ手順（Vercel + Neon + Anthropic + GitHub Actions）

## 全体構成

| 役割 | サービス | 動くもの |
|---|---|---|
| Web（AIチャット・物件一覧・問い合わせ・管理画面・LINE Webhook） | **Vercel**（東京リージョン hnd1） | `apps/web` |
| DB | **Neon**（PostgreSQL + pgvector、リージョンは AWS Tokyo） | `packages/db` |
| AI | **Anthropic Claude API** | `apps/web/lib/ai.ts` |
| 巡回 → マッチング → 通知（30分ごと） | **GitHub Actions** | `.github/workflows/crawl.yml` |
| 通知 | LINE 公式アカウント（Messaging API）／ Resend（メール） | `packages/services/src/notify` |

巡回は Playwright（ブラウザ）を使います。Vercel の関数では実行時間とサイズの制限があるため、GitHub Actions で動かします。

---

## あなたにお願いしたい作業（上から順に）

### 1. Neon（DB）
1. https://console.neon.tech でプロジェクトを作成する（Region: **AWS Asia Pacific (Tokyo)**、Postgres 16 以上）
2. Dashboard → Connect で **Pooled connection** の接続文字列をコピーする（`postgresql://...-pooler...neon.tech/neondb?sslmode=require`）
3. これが `DATABASE_URL` になります（手順 5・6 で使います）

### 2. Anthropic（AI）
1. https://console.anthropic.com → API Keys でキーを発行する → `ANTHROPIC_API_KEY`
2. Billing でクレジットを入れる（会話1往復の目安は数円〜十数円。`DEVOTE_CHAT_EFFORT=low` にすると安く速くなります）

### 3. LINE 公式アカウント（フリープラン）
1. https://entry.line.biz で公式アカウントを作成する（プラン: コミュニケーションプラン＝無料、月200通まで）
2. LINE Official Account Manager → 設定 → Messaging API → **Messaging API を利用する**（プロバイダーを作成）
3. https://developers.line.biz/console/ で、作成されたチャネルを開く
   - チャネル基本設定 → **チャネルシークレット** → `LINE_CHANNEL_SECRET`
   - Messaging API設定 → **チャネルアクセストークン（長期）** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
   - Messaging API設定 → **Webhook URL** に `https://<Vercel のドメイン>/api/line/webhook` を設定し、「Webhookの利用」をオン（手順 5 の後で設定）
   - 「応答メッセージ」「あいさつメッセージ」は Official Account Manager でオフにする（Devote が返信するため）
4. 友だち追加URL（`https://lin.ee/xxxx`）→ `NEXT_PUBLIC_LINE_ADD_FRIEND_URL`

> フリープランは月200通です。Devote は1回の通知を1通（カルーセル）にまとめて送ります。上限に達するとメールに切り替わります。
> 利用者が増えたらライトプラン（月5,000円・5,000通）への変更を検討してください。

### 4. Resend（メール）
1. https://resend.com でアカウントを作成する → API Keys → `RESEND_API_KEY`
2. Domains で送信用ドメイン（例: `mail.micado.jp`）を追加し、表示される DNS レコード（SPF/DKIM）を登録する
3. `MAIL_FROM` を `Devote <notify@mail.micado.jp>` のように設定する

### 5. Vercel（Web）
1. https://vercel.com/new で GitHub リポジトリ `ttmicado/devote` を Import する
2. **Root Directory を `apps/web`** にする（Framework は Next.js が自動で選ばれます）
3. Environment Variables に以下を設定する

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | Neon の pooled 接続文字列 |
| `APP_URL` | `https://<プロジェクト名>.vercel.app`（独自ドメインを使うならそちら） |
| `SESSION_SECRET` | ランダムな32文字以上（`openssl rand -base64 32`） |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 管理画面のID・パスワード |
| `ANTHROPIC_API_KEY` | 手順2 |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | 手順3 |
| `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` | 手順3 |
| `RESEND_API_KEY` / `MAIL_FROM` | 手順4 |

4. Deploy → 完了したら LINE の Webhook URL を設定し、「検証」ボタンで成功することを確認する

### 6. GitHub（巡回・マイグレーション）
リポジトリ → Settings → Secrets and variables → Actions

**Secrets**（New repository secret）

| 名前 | 値 |
|---|---|
| `DATABASE_URL` | Neon の接続文字列 |
| `APP_URL` | Vercel のURL |
| `LINE_CHANNEL_ACCESS_TOKEN` | 手順3 |
| `RESEND_API_KEY` / `MAIL_FROM` | 手順4 |
| `REINS_USER_ID` / `REINS_PASSWORD` | レインズ |
| `ATBB_USER_ID` / `ATBB_PASSWORD` | ATBB |
| `ITANDI_EMAIL` / `ITANDI_PASSWORD` | ITANDI BB |

**Variables**（任意）
- `ENABLE_UNVERIFIED_SOURCES` = `1` … 動作確認前の会員サイトのアダプターも巡回する（確認が済むまでは空のまま）
- `DEVOTE_SOURCES` … 巡回するソースを絞る（例: 会員サイトは国内マシンで動かす場合）

その後:
1. Actions → **DB Migrate** → Run workflow（Neon にテーブルを作る。以後 main へのマージで自動実行）
2. Actions → **Crawl & Notify** → Run workflow（初回の巡回。以後30分ごとに自動実行）
3. Vercel の `/admin` で「巡回ソースの状況」に結果が出ることを確認する

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
