import { sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads } from "@/db/schema";
import { APP_VERSION, formatBytes, getSettings } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getSettings();
  const [row] = await db
    .select({
      videoCount: sql<number>`count(*) filter (where ${downloads.fileType} = 'video' and ${downloads.status} = 'completed')`,
      audioCount: sql<number>`count(*) filter (where ${downloads.fileType} = 'audio' and ${downloads.status} = 'completed')`,
      todayVideo: sql<number>`count(*) filter (where ${downloads.fileType} = 'video' and ${downloads.createdAt} > now() - interval '1 day')`,
      todayAudio: sql<number>`count(*) filter (where ${downloads.fileType} = 'audio' and ${downloads.createdAt} > now() - interval '1 day')`,
      totalBytes: sql<number>`coalesce(sum(${downloads.fileSize}), 0)`,
      active: sql<number>`count(*) filter (where ${downloads.status} in ('waiting','downloading','preparing','fetching','paused'))`,
      failed: sql<number>`count(*) filter (where ${downloads.status} = 'failed')`,
      interrupted: sql<number>`count(*) filter (where ${downloads.status} = 'interrupted')`,
      total: sql<number>`count(*)`,
    })
    .from(downloads);

  return Response.json({
    ok: true,
    version: APP_VERSION,
    birthTime: current.birthTime,
    desktopConnected: current.desktopConnected,
    downloadDirectory: current.downloadDirectory,
    stats: {
      videoCount: Number(row.videoCount),
      audioCount: Number(row.audioCount),
      todayVideo: Number(row.todayVideo),
      todayAudio: Number(row.todayAudio),
      totalBytes: Number(row.totalBytes),
      totalSizeLabel: formatBytes(Number(row.totalBytes)),
      active: Number(row.active),
      failed: Number(row.failed),
      interrupted: Number(row.interrupted),
      total: Number(row.total),
    },
  });
}
