import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads, settings } from "@/db/schema";
import { DEFAULT_SETTINGS, getSettings, writeLog } from "@/lib/core";

export const dynamic = "force-dynamic";

type Body = {
  confirm?: boolean;
  keepVideos?: boolean;
  keepAudio?: boolean;
  resetSettings?: boolean;
};

/**
 * 重置流程：顯示確認 → 使用者確認 → 再次檢查選項 → 建立刪除清單 → 刪除 → 回報 → 完成
 * 檔案刪除失敗不會讓流程崩潰，會列在 failures。
 */
export async function POST(request: Request) {
  await getSettings();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return Response.json(
      { ok: false, error: "需要二次確認（confirm=true）才能執行重置" },
      { status: 400 },
    );
  }

  const keepVideos = body.keepVideos === true;
  const keepAudio = body.keepAudio === true;

  // 建立刪除清單（先列出，再刪除）
  const plan = await db
    .select({
      id: downloads.id,
      title: downloads.title,
      fileType: downloads.fileType,
      filePath: downloads.filePath,
    })
    .from(downloads);

  const toDelete = plan.filter((item) =>
    item.fileType === "video" ? !keepVideos : !keepAudio,
  );
  const kept = plan.length - toDelete.length;

  const failures: string[] = [];
  let removed = 0;
  for (const item of toDelete) {
    try {
      await db.delete(downloads).where(eq(downloads.id, item.id));
      removed += 1;
    } catch {
      failures.push(item.title);
    }
  }

  if (body.resetSettings !== false) {
    await db
      .update(settings)
      .set({
        notifications: DEFAULT_SETTINGS.notifications,
        videoDetection: DEFAULT_SETTINGS.videoDetection,
        autoStart: DEFAULT_SETTINGS.autoStart,
        downloadMode: DEFAULT_SETTINGS.downloadMode,
        downloadDirectory: DEFAULT_SETTINGS.downloadDirectory,
        videoQuality: DEFAULT_SETTINGS.videoQuality,
        maxConcurrent: DEFAULT_SETTINGS.maxConcurrent,
        youtubeBackup: DEFAULT_SETTINGS.youtubeBackup,
        tiktokBackup: DEFAULT_SETTINGS.tiktokBackup,
        autoBackupAcknowledged: false,
        keepVideosOnReset: keepVideos,
        keepAudioOnReset: keepAudio,
        debugMode: false,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, 1));
  }

  await writeLog(
    "RESET_DONE",
    `刪除 ${removed} 筆 / 保留 ${kept} 筆 / 失敗 ${failures.length} 筆`,
    failures.length ? "warn" : "info",
  );

  const [remaining] = await db
    .select({ count: sql<number>`count(*)` })
    .from(downloads);

  return Response.json({
    ok: true,
    planned: toDelete.length,
    removed,
    kept,
    failures,
    remaining: Number(remaining.count),
    message: failures.length
      ? `重置完成，但有 ${failures.length} 筆資料無法刪除（部分檔案無法刪除）`
      : "重置完成",
  });
}
