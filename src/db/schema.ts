import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 設定表（單列，id = 1）。所有開關 / 路徑 / 版本都從這裡讀取，不硬編碼。
 */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  version: text("version").notNull().default("1.0"),
  notifications: boolean("notifications").notNull().default(true),
  videoDetection: boolean("video_detection").notNull().default(true),
  autoStart: boolean("auto_start").notNull().default(true),
  // "ask" = 每次都要訪問下載位置, "direct" = 直接下載
  downloadMode: text("download_mode").notNull().default("ask"),
  downloadDirectory: text("download_directory").notNull().default(""),
  videoQuality: text("video_quality").notNull().default("720p"),
  maxConcurrent: integer("max_concurrent").notNull().default(2),
  youtubeBackup: boolean("youtube_backup").notNull().default(false),
  tiktokBackup: boolean("tiktok_backup").notNull().default(false),
  autoBackupAcknowledged: boolean("auto_backup_acknowledged")
    .notNull()
    .default(false),
  keepVideosOnReset: boolean("keep_videos_on_reset").notNull().default(false),
  keepAudioOnReset: boolean("keep_audio_on_reset").notNull().default(false),
  debugMode: boolean("debug_mode").notNull().default(false),
  desktopConnected: boolean("desktop_connected").notNull().default(false),
  desktopLastSeen: timestamp("desktop_last_seen", { withTimezone: true }),
  birthTime: timestamp("birth_time", { withTimezone: true })
    .notNull()
    .default(new Date("2026-09-28T00:00:00Z")),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 下載紀錄 / 下載佇列（同一張表，用 status 區分）。
 * status: waiting | fetching | preparing | downloading | paused | completed | failed | cancelled | interrupted | missing
 */
export const downloads = pgTable(
  "downloads",
  {
    id: serial("id").primaryKey(),
    requestId: text("request_id").notNull(),
    title: text("title").notNull(),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    fileType: text("file_type").notNull().default("video"), // video | audio
    format: text("format").notNull().default("mp4"), // mp4 | webm | mp3 | ogg
    quality: text("quality").notNull().default("720p"),
    duration: text("duration").notNull().default("未知"),
    thumbnail: text("thumbnail"),
    filePath: text("file_path").notNull().default(""),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("waiting"),
    errorMessage: text("error_message"),
    source: text("source").notNull().default("control-center"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("downloads_status_idx").on(table.status),
    index("downloads_file_type_idx").on(table.fileType),
  ],
);

/**
 * 系統日誌（對應 desktop 的 logs/YYYY-MM-DD.log）
 */
export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull().default("info"), // info | warn | error
  event: text("event").notNull(),
  message: text("message").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type DownloadRow = typeof downloads.$inferSelect;
export type LogRow = typeof logs.$inferSelect;
