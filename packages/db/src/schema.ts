import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ───────────────────────── 収集（スクレイピング） ───────────────────────── */

/** 生HTMLスナップショット。本体はオブジェクトストレージ（storageKey）、DBはメタデータのみ */
export const rawSnapshots = pgTable(
  "raw_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    kind: text("kind", { enum: ["list", "detail"] }).notNull(),
    url: text("url").notNull(),
    httpStatus: smallint("http_status").notNull(),
    contentSha256: text("content_sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    parserVersion: text("parser_version"), // 最後にパースしたパーサのバージョン（再パース判定用）
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("raw_snapshots_source_fetched_idx").on(t.source, t.fetchedAt)],
);

export const listingStatus = pgEnum("listing_status", ["active", "closed"]);

/** 1ソースの1掲載。名寄せ後は propertyId で実物件にひも付く */
export const listings = pgTable(
  "listings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    sourceListingId: text("source_listing_id").notNull(),
    url: text("url").notNull(),
    propertyId: uuid("property_id").references(() => properties.id),
    status: listingStatus("status").notNull().default("active"),
    /** NormalizedListing（@devote/core）をそのまま保持 */
    data: jsonb("data").notNull(),
    contentHash: text("content_hash").notNull(),
    /** 一覧で取れる値のハッシュ。変化がなければ詳細取得を省略する */
    listHash: text("list_hash"),
    price: integer("price").notNull(),
    adAllowed: boolean("ad_allowed"),
    missCount: smallint("miss_count").notNull().default(0), // 一覧で連続未検出の回数（掲載終了判定）
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("listings_source_listing_uq").on(t.source, t.sourceListingId),
    index("listings_property_idx").on(t.propertyId),
  ],
);

/** 名寄せ済みの実物件（同じ部屋が複数サイトに載っても1件） */
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealType: text("deal_type", { enum: ["rent", "sale"] }).notNull(),
    dedupeBlockKey: text("dedupe_block_key"),
    /** 代表値（優先ソースの値を採用） */
    data: jsonb("data").notNull(),
    price: integer("price").notNull(),
    areaSqm: real("area_sqm"),
    layout: text("layout"),
    city: text("city"),
    lat: real("lat"),
    lng: real("lng"),
    /** 類似物件推薦用: 数値特徴量ベクトル（標準化済み）と説明文の埋め込み */
    featureVec: vector("feature_vec", { dimensions: 64 }),
    embedding: vector("embedding", { dimensions: 1024 }),
    status: listingStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("properties_block_idx").on(t.dedupeBlockKey),
    index("properties_feature_hnsw").using("hnsw", t.featureVec.op("vector_cosine_ops")),
  ],
);

export const changeType = pgEnum("change_type", [
  "new",
  "price_down",
  "price_up",
  "field_changed",
  "delisted",
  "relisted",
]);

/** 収集と通知をつなぐ唯一の接点。通知側はこのテーブルをカーソルで追う */
export const changeEvents = pgTable(
  "change_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id),
    propertyId: uuid("property_id").references(() => properties.id),
    type: changeType("type").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("change_events_detected_idx").on(t.detectedAt)],
);

/* ───────────────────────── ユーザー・条件 ───────────────────────── */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name"),
  /** お呼びする名前（AIや通知で「○○様」） */
  nickname: text("nickname"),
  /** ログインID（小文字で保存。メールアドレスでも可） */
  loginId: text("login_id").unique(),
  /** scrypt のハッシュ（apps/web/lib/password.ts） */
  passwordHash: text("password_hash"),
  failedLogins: smallint("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** セッション Cookie の世代。パスワード変更で上げると、他の端末のセッションが無効になる */
  sessionVersion: integer("session_version").notNull().default(0),
  /** AIチャットの同時実行防止（応答中はこの時刻まで次のメッセージを受け付けない） */
  chatLockedUntil: timestamp("chat_locked_until", { withTimezone: true }),
  /** AIチャットで編集中（未確定）の条件 */
  draftCondition: jsonb("draft_condition"),
  draftPhase: text("draft_phase", { enum: ["exploring", "considering", "ready"] }),
  ...timestamps,
});

/** メール確認・LINE連携などのワンタイムトークン */
export const verificationTokens = pgTable("verification_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  purpose: text("purpose", { enum: ["email_verify", "line_link"] }).notNull(),
  payload: text("payload"), // email_verify: メールアドレス
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** 固定ウィンドウのレート制限（key: 用途と識別子、例 "chat:ip:203.0.113.1"） */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** 従量課金・無料枠のあるソースの日別利用量（kind: list=検索, detail=物件詳細, drawing=図面） */
export const sourceUsage = pgTable(
  "source_usage",
  {
    source: text("source").notNull(),
    day: date("day").notNull(), // JST の日付
    kind: text("kind", { enum: ["list", "detail", "drawing"] }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("source_usage_uq").on(t.source, t.day, t.kind)],
);

/** 巡回の実行ログ（管理画面のソース状況表示・構造変化の検知） */
export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    seen: integer("seen").notNull().default(0),
    fetched: integer("fetched").notNull().default(0),
    inArea: integer("in_area").notNull().default(0),
    newCount: integer("new_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    delistedCount: integer("delisted_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    warnings: jsonb("warnings").notNull().default(sql`'[]'::jsonb`),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("crawl_runs_source_idx").on(t.source, t.startedAt)],
);

export const channelType = pgEnum("channel_type", ["line", "instagram", "email"]);

/** 通知チャネルのひも付け（LINE userId / Instagram IGSID / メールアドレス） */
export const userChannels = pgTable(
  "user_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    channel: channelType("channel").notNull(),
    address: text("address").notNull(),
    priority: smallint("priority").notNull().default(0), // 小さいほど優先（LINE > メール > IG）
    active: boolean("active").notNull().default(true), // ブロック・配信停止で false
    /** Instagram: 最後にユーザーからDMを受けた時刻（24時間ウィンドウ判定） */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("user_channels_uq").on(t.channel, t.address)],
);

export const searchPhase = pgEnum("search_phase", ["exploring", "considering", "ready"]);
export const notifyFrequency = pgEnum("notify_frequency", ["instant", "daily", "weekly"]);

/** AIヒアリングで確定した条件（版管理。条件の緩和・強化の履歴を分析に使う） */
export const searchConditions = pgTable(
  "search_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    version: integer("version").notNull(),
    /** SearchCondition（@devote/core） */
    condition: jsonb("condition").notNull(),
    phase: searchPhase("phase").notNull().default("exploring"),
    frequency: notifyFrequency("frequency").notNull().default("daily"),
    sendHour: smallint("send_hour").notNull().default(19), // daily/weekly の送信時刻（JST）
    active: boolean("active").notNull().default(true),
    /** 会話要約の埋め込み（暮らしのイメージ） */
    embedding: vector("embedding", { dimensions: 1024 }),
    ...timestamps,
  },
  (t) => [uniqueIndex("search_conditions_user_version_uq").on(t.userId, t.version)],
);

/** AIチャットのセッションとメッセージ（Claude API の messages をそのまま保存） */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_user_idx").on(t.userId, t.createdAt)],
);

/* ───────────────────────── マッチング・通知 ───────────────────────── */

export const matches = pgTable(
  "matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    conditionVersion: integer("condition_version").notNull(),
    score: smallint("score").notNull(),
    reasons: jsonb("reasons").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("matches_uq").on(t.userId, t.propertyId, t.conditionVersion)],
);

/** 送信済み台帳。INSERT ... ON CONFLICT DO NOTHING で二重送信を防ぐ */
export const sentLedger = pgTable(
  "sent_ledger",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    reason: text("reason", { enum: ["new", "price_down", "similar"] }).notNull(),
    notificationId: uuid("notification_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sent_ledger_pk").on(t.userId, t.propertyId, t.reason)],
);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  channel: channelType("channel").notNull(),
  status: text("status", { enum: ["scheduled", "sent", "failed", "skipped"] }).notNull(),
  propertyIds: uuid("property_ids").array().notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
});

/* ───────────────────────── 内見問い合わせ・管理 ───────────────────────── */

export const inquiryStatus = pgEnum("inquiry_status", [
  "new", // 受付
  "checking", // 元付に空室・客付可否を確認中
  "available", // 紹介可 → 内見調整へ
  "viewing_scheduled",
  "unavailable", // 対応不可（客付NG・申込済など）→ 類似物件を提案
  "closed",
]);

export const inquiries = pgTable("inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  status: inquiryStatus("status").notNull().default("new"),
  unavailableReason: text("unavailable_reason", {
    enum: ["broker_refused", "already_applied", "condition_mismatch", "other"],
  }),
  preferredDates: jsonb("preferred_dates"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  message: text("message"),
  adminNote: text("admin_note"),
  ...timestamps,
});

/** 類似物件提案と管理者の判断（将来のAI自律判断の学習データ） */
export const similarSuggestions = pgTable("similar_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id")
    .notNull()
    .references(() => inquiries.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  similarity: real("similarity").notNull(),
  rank: smallint("rank").notNull(),
  /** 管理者の判定: 承認して送る / 却下 */
  adminDecision: text("admin_decision", { enum: ["approved", "rejected"] }),
  adminNote: text("admin_note"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  userReaction: text("user_reaction", { enum: ["clicked", "inquired", "dismissed"] }),
  ...timestamps,
});
