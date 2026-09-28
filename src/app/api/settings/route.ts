import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { APP_VERSION, QUALITIES, getSettings, writeLog } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getSettings();
  return Response.json({ ok: true, settings: current, version: APP_VERSION });
}

type Patch = Partial<{
  notifications: boolean;
  videoDetection: boolean;
  autoStart: boolean;
  downloadMode: string;
  downloadDirectory: string;
  videoQuality: string;
  maxConcurrent: number;
  youtubeBackup: boolean;
  tiktokBackup: boolean;
  autoBackupAcknowledged: boolean;
  keepVideosOnReset: boolean;
  keepAudioOnReset: boolean;
  debugMode: boolean;
  desktopConnected: boolean;
}>;

export async function PATCH(request: Request) {
  await getSettings();
  let body: Patch;
  try {
    body = (await request.json()) as Patch;
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  const bools: (keyof Patch)[] = [
    "notifications",
    "videoDetection",
    "autoStart",
    "youtubeBackup",
    "tiktokBackup",
    "autoBackupAcknowledged",
    "keepVideosOnReset",
    "keepAudioOnReset",
    "debugMode",
    "desktopConnected",
  ];
  for (const key of bools) {
    if (typeof body[key] === "boolean") update[key] = body[key];
  }
  if (body.downloadMode === "ask" || body.downloadMode === "direct") {
    update.downloadMode = body.downloadMode;
  }
  if (typeof body.downloadDirectory === "string") {
    const dir = body.downloadDirectory.trim().slice(0, 260);
    if (dir && !/^[a-zA-Z]:\\|^\\\\|^\/|^~/.test(dir)) {
      return Response.json(
        { ok: false, error: "下載位置必須是絕對路徑，例如 D:\\VideoBackup" },
        { status: 400 },
      );
    }
    update.downloadDirectory = dir;
  }
  if (
    typeof body.videoQuality === "string" &&
    (QUALITIES as readonly string[]).includes(body.videoQuality)
  ) {
    update.videoQuality = body.videoQuality;
  }
  if (
    typeof body.maxConcurrent === "number" &&
    [1, 2, 3, 4].includes(body.maxConcurrent)
  ) {
    update.maxConcurrent = body.maxConcurrent;
  }
  if (typeof body.desktopConnected === "boolean") {
    update.desktopLastSeen = body.desktopConnected ? new Date() : null;
  }

  const [row] = await db
    .update(settings)
    .set(update)
    .where(eq(settings.id, 1))
    .returning();

  await writeLog("SETTINGS_UPDATED", Object.keys(update).join(","));
  return Response.json({ ok: true, settings: row });
}
