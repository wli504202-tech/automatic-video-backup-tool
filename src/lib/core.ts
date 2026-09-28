import { eq } from "drizzle-orm";
import { db } from "@/db";
import { logs, settings, type Settings } from "@/db/schema";

export const APP_VERSION = "1.0";
export const APP_NAME = "阿柚自動影片備份";
export const BIRTH_TIME_ISO = "2026-09-28T18:00:00+08:00";
export const QUALITIES = ["1080p", "720p", "480p", "240p"] as const;
export type Quality = (typeof QUALITIES)[number];

export const DEFAULT_SETTINGS = {
  id: 1,
  version: APP_VERSION,
  notifications: true,
  videoDetection: true,
  autoStart: true,
  downloadMode: "ask" as const,
  downloadDirectory: "",
  videoQuality: "720p",
  maxConcurrent: 2,
  youtubeBackup: false,
  tiktokBackup: false,
  autoBackupAcknowledged: false,
  keepVideosOnReset: false,
  keepAudioOnReset: false,
  debugMode: false,
  desktopConnected: false,
  birthTime: new Date(BIRTH_TIME_ISO),
};

let bootstrapped = false;

/** 建表（冪等），讓沙盒 / 全新資料庫也能直接運作。 */
export async function ensureSchema() {
  if (bootstrapped) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id integer PRIMARY KEY DEFAULT 1,
      version text NOT NULL DEFAULT '1.0',
      notifications boolean NOT NULL DEFAULT true,
      video_detection boolean NOT NULL DEFAULT true,
      auto_start boolean NOT NULL DEFAULT true,
      download_mode text NOT NULL DEFAULT 'ask',
      download_directory text NOT NULL DEFAULT '',
      video_quality text NOT NULL DEFAULT '720p',
      max_concurrent integer NOT NULL DEFAULT 2,
      youtube_backup boolean NOT NULL DEFAULT false,
      tiktok_backup boolean NOT NULL DEFAULT false,
      auto_backup_acknowledged boolean NOT NULL DEFAULT false,
      keep_videos_on_reset boolean NOT NULL DEFAULT false,
      keep_audio_on_reset boolean NOT NULL DEFAULT false,
      debug_mode boolean NOT NULL DEFAULT false,
      desktop_connected boolean NOT NULL DEFAULT false,
      desktop_last_seen timestamptz,
      birth_time timestamptz NOT NULL DEFAULT '2026-09-28T18:00:00+08:00',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS downloads (
      id serial PRIMARY KEY,
      request_id text NOT NULL,
      title text NOT NULL,
      platform text NOT NULL,
      url text NOT NULL,
      file_type text NOT NULL DEFAULT 'video',
      format text NOT NULL DEFAULT 'mp4',
      quality text NOT NULL DEFAULT '720p',
      duration text NOT NULL DEFAULT '未知',
      thumbnail text,
      file_path text NOT NULL DEFAULT '',
      file_size bigint NOT NULL DEFAULT 0,
      progress integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'waiting',
      error_message text,
      source text NOT NULL DEFAULT 'control-center',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS downloads_status_idx ON downloads (status);
    CREATE INDEX IF NOT EXISTS downloads_file_type_idx ON downloads (file_type);
    CREATE TABLE IF NOT EXISTS logs (
      id serial PRIMARY KEY,
      level text NOT NULL DEFAULT 'info',
      event text NOT NULL,
      message text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  bootstrapped = true;
}

export async function getSettings(): Promise<Settings> {
  await ensureSchema();
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  if (rows.length > 0) return rows[0];
  const inserted = await db
    .insert(settings)
    .values(DEFAULT_SETTINGS)
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return inserted[0];
  const again = await db.select().from(settings).where(eq(settings.id, 1));
  return again[0];
}

export async function writeLog(
  event: string,
  message = "",
  level: "info" | "warn" | "error" = "info",
) {
  try {
    await ensureSchema();
    await db.insert(logs).values({ event, message, level });
  } catch {
    // 日誌失敗不可讓主流程崩潰
  }
}

/** Windows 檔名清理：/ \ : * ? " < > | 以及長度限制 */
export function sanitizeFileName(raw: string, maxLength = 120): string {
  let name = (raw || "untitled").normalize("NFC");
  name = name.replace(/[:]/g, " - ");
  name = name.replace(/[/\\*?"<>|]/g, "-");
  name = name.replace(/[\u0000-\u001f]/g, "");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/[-. ]+$/g, "").replace(/^[-. ]+/g, "");
  const reserved =
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reserved.test(name)) name = `_${name}`;
  if (name.length > maxLength) name = name.slice(0, maxLength).trim();
  return name || "untitled";
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "未知";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Native Messaging 訊息白名單與驗證（Extension ↔ Desktop 共用規則） */
export const ALLOWED_MESSAGE_TYPES = [
  "HANDSHAKE",
  "PING",
  "VIDEO_DETECTED",
  "VIDEO_READY",
  "DOWNLOAD_REQUEST",
  "DOWNLOAD_PROGRESS",
  "DOWNLOAD_COMPLETE",
  "DOWNLOAD_FAILED",
  "SETTINGS_SYNC",
  "RESET_REQUEST",
  "QUEUE_CONTROL",
] as const;

export type NativeMessageType = (typeof ALLOWED_MESSAGE_TYPES)[number];

const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "www.instagram.com",
];

export function isAllowedVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("youtube") || host === "youtu.be") return "youtube";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("instagram")) return "instagram";
    return null;
  } catch {
    return null;
  }
}

export type ValidationResult =
  | { ok: true; type: NativeMessageType; payload: Record<string, unknown> }
  | { ok: false; error: string };

export function validateNativeMessage(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "訊息必須是 JSON 物件" };
  }
  const message = input as Record<string, unknown>;
  const type = message.type;
  if (typeof type !== "string") {
    return { ok: false, error: "缺少 type 欄位" };
  }
  if (!(ALLOWED_MESSAGE_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: `不允許的命令類型：${type}` };
  }
  const forbidden = ["command", "shell", "exec", "path", "script", "eval"];
  for (const key of forbidden) {
    if (key in message) {
      return { ok: false, error: `訊息含有禁止欄位：${key}（拒絕任意指令）` };
    }
  }
  if (type === "VIDEO_DETECTED" || type === "DOWNLOAD_REQUEST") {
    const url = message.url;
    if (typeof url !== "string" || !isAllowedVideoUrl(url)) {
      return { ok: false, error: "url 不在允許的平台白名單內" };
    }
  }
  if (type === "DOWNLOAD_REQUEST") {
    const format = message.format;
    if (format !== "video" && format !== "audio") {
      return { ok: false, error: "format 只能是 video 或 audio" };
    }
  }
  return { ok: true, type: type as NativeMessageType, payload: message };
}

export function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/")[2] ?? null;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

export function tiktokId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}
