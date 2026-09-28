import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads, settings } from "@/db/schema";
import {
  ALLOWED_MESSAGE_TYPES,
  APP_VERSION,
  detectPlatform,
  getSettings,
  sanitizeFileName,
  validateNativeMessage,
  writeLog,
} from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getSettings();
  return Response.json({
    ok: true,
    host: "com.ahyoo.video_backup",
    version: APP_VERSION,
    allowedTypes: ALLOWED_MESSAGE_TYPES,
    desktopConnected: current.desktopConnected,
    desktopLastSeen: current.desktopLastSeen,
  });
}

/**
 * Native Messaging 訊息閘道（與 Desktop 端 native_host.py 使用同一組驗證規則）。
 * 只接受白名單命令，不接受任何 shell / exec / 任意路徑操作。
 */
export async function POST(request: Request) {
  const current = await getSettings();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }

  const result = validateNativeMessage(raw);
  if (!result.ok) {
    await writeLog("NATIVE_REJECTED", result.error, "warn");
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  const message = result.payload;
  const requestId =
    typeof message.requestId === "string" && /^[\w-]{4,64}$/.test(message.requestId)
      ? message.requestId
      : `req_${Date.now().toString(36)}`;

  switch (result.type) {
    case "HANDSHAKE":
    case "PING": {
      await db
        .update(settings)
        .set({ desktopConnected: true, desktopLastSeen: new Date(), updatedAt: new Date() })
        .where(eq(settings.id, 1));
      await writeLog("EXTENSION_CONNECTED", "Native host handshake");
      return Response.json({
        ok: true,
        response: { type: "HANDSHAKE_ACK", version: APP_VERSION, status: "connected" },
      });
    }

    case "VIDEO_DETECTED": {
      await writeLog(
        "VIDEO_DETECTED",
        `${String(message.platform ?? detectPlatform(String(message.url)))} / ${String(
          message.title ?? "",
        ).slice(0, 80)}`,
      );
      return Response.json({
        ok: true,
        response: {
          type: "VIDEO_READY",
          requestId,
          status: "ready",
          quality: current.videoQuality,
          downloadMode: current.downloadMode,
        },
      });
    }

    case "DOWNLOAD_REQUEST": {
      const fileType = message.format === "audio" ? "audio" : "video";
      const title = sanitizeFileName(String(message.title ?? "未命名影片"));
      const url = String(message.url);
      const platform = detectPlatform(url) ?? "unknown";
      const format = fileType === "video" ? "mp4" : "mp3";
      const quality = fileType === "video" ? current.videoQuality : "-";
      const baseDir = current.downloadDirectory || "阿柚自動影片備份";
      const sep = /^[a-zA-Z]:\\|^\\\\/.test(baseDir) ? "\\" : "/";
      const filePath =
        current.downloadMode === "direct"
          ? [baseDir, fileType, `${title}.${format}`].join(sep)
          : "";

      const [row] = await db
        .insert(downloads)
        .values({
          requestId,
          title,
          platform,
          url,
          fileType,
          format,
          quality,
          duration: String(message.duration ?? "未知"),
          status: "waiting",
          filePath,
          source: "extension",
        })
        .returning();

      await writeLog("DOWNLOAD_STARTED", `${platform} / ${fileType} / ${title}`);
      return Response.json({
        ok: true,
        response: {
          type: "DOWNLOAD_ACCEPTED",
          requestId,
          id: row.id,
          status: "waiting",
          askLocation: current.downloadMode === "ask",
        },
      });
    }

    case "DOWNLOAD_PROGRESS":
    case "DOWNLOAD_COMPLETE":
    case "DOWNLOAD_FAILED": {
      const rows = await db
        .select()
        .from(downloads)
        .where(eq(downloads.requestId, requestId))
        .orderBy(desc(downloads.id))
        .limit(1);
      if (rows.length === 0) {
        return Response.json(
          { ok: false, error: "找不到對應的 requestId" },
          { status: 404 },
        );
      }
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (result.type === "DOWNLOAD_PROGRESS") {
        const p = Number(message.progress ?? 0);
        update.progress = Math.max(0, Math.min(100, Math.round(p)));
        update.status = "downloading";
        if (typeof message.fileSize === "number") update.fileSize = message.fileSize;
      } else if (result.type === "DOWNLOAD_COMPLETE") {
        update.progress = 100;
        update.status = "completed";
        if (typeof message.fileSize === "number") update.fileSize = message.fileSize;
        if (typeof message.filePath === "string") {
          update.filePath = message.filePath.slice(0, 500);
        }
      } else {
        update.status = "failed";
        update.errorMessage = String(message.error ?? "下載失敗（未提供原因）").slice(0, 500);
      }
      const [updated] = await db
        .update(downloads)
        .set(update)
        .where(eq(downloads.id, rows[0].id))
        .returning();
      await writeLog(
        result.type,
        `${updated.title} → ${updated.status} ${updated.progress}%`,
        result.type === "DOWNLOAD_FAILED" ? "error" : "info",
      );
      return Response.json({ ok: true, response: { type: "ACK", requestId }, download: updated });
    }

    case "SETTINGS_SYNC": {
      await writeLog("SETTINGS_SYNC", "Extension 讀取設定");
      return Response.json({
        ok: true,
        response: {
          type: "SETTINGS_STATE",
          settings: {
            version: current.version,
            notifications: current.notifications,
            videoDetection: current.videoDetection,
            autoStart: current.autoStart,
            downloadMode: current.downloadMode,
            downloadDirectory: current.downloadDirectory,
            videoQuality: current.videoQuality,
            maxConcurrent: current.maxConcurrent,
            youtubeBackup: current.youtubeBackup,
            tiktokBackup: current.tiktokBackup,
          },
        },
      });
    }

    case "QUEUE_CONTROL": {
      const action = String(message.action ?? "");
      if (!["pause", "resume"].includes(action)) {
        return Response.json({ ok: false, error: "不支援的佇列動作" }, { status: 400 });
      }
      const rows =
        action === "pause"
          ? await db
              .update(downloads)
              .set({ status: "paused", updatedAt: new Date() })
              .where(sql`${downloads.status} in ('waiting','downloading','preparing','fetching')`)
              .returning()
          : await db
              .update(downloads)
              .set({ status: "waiting", updatedAt: new Date() })
              .where(sql`${downloads.status} = 'paused'`)
              .returning();
      return Response.json({
        ok: true,
        response: { type: "QUEUE_STATE", action, affected: rows.length },
      });
    }

    case "RESET_REQUEST": {
      // 安全機制：Native 端不得直接觸發刪除，必須由使用者在 UI 二次確認
      await writeLog("RESET_REQUEST", "需要使用者在 UI 確認", "warn");
      return Response.json({
        ok: true,
        response: {
          type: "RESET_NEEDS_CONFIRMATION",
          message: "重置必須在設定頁二次確認後才會執行",
        },
      });
    }

    default:
      return Response.json({ ok: false, error: "未處理的命令" }, { status: 400 });
  }
}
