import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads } from "@/db/schema";
import {
  detectPlatform,
  getSettings,
  isAllowedVideoUrl,
  sanitizeFileName,
  writeLog,
} from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await getSettings();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const filter = searchParams.get("filter") ?? "all";
  const sort = searchParams.get("sort") ?? "newest";
  const scope = searchParams.get("scope") ?? "all";

  const where = [];
  if (q) where.push(ilike(downloads.title, `%${q}%`));
  if (filter === "video" || filter === "audio") {
    where.push(eq(downloads.fileType, filter));
  }
  if (scope === "queue") {
    where.push(
      sql`${downloads.status} in ('waiting','fetching','preparing','downloading','paused','interrupted')`,
    );
  }

  const order =
    sort === "oldest"
      ? asc(downloads.createdAt)
      : sort === "size"
        ? desc(downloads.fileSize)
        : desc(downloads.createdAt);

  const rows = await db
    .select()
    .from(downloads)
    .where(where.length ? and(...where) : undefined)
    .orderBy(order)
    .limit(300);

  return Response.json({ ok: true, downloads: rows });
}

type CreateBody = {
  url?: string;
  title?: string;
  fileType?: "video" | "audio";
  format?: string;
  quality?: string;
  duration?: string;
  thumbnail?: string;
  source?: string;
  requestId?: string;
};

export async function POST(request: Request) {
  const current = await getSettings();
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!isAllowedVideoUrl(url)) {
    return Response.json(
      { ok: false, error: "此網址不在允許的平台白名單內（YouTube / TikTok / Instagram）" },
      { status: 400 },
    );
  }
  const platform = detectPlatform(url) ?? "unknown";
  const fileType = body.fileType === "audio" ? "audio" : "video";
  const allowedFormats =
    fileType === "video" ? ["mp4", "webm"] : ["mp3", "ogg"];
  const format = allowedFormats.includes(body.format ?? "")
    ? (body.format as string)
    : fileType === "video"
      ? "mp4"
      : "mp3";
  const title = sanitizeFileName(body.title ?? "未命名影片");
  const quality = fileType === "audio" ? "-" : (body.quality ?? current.videoQuality);
  const baseDir = current.downloadDirectory || "阿柚自動影片備份";
  const separator = /^[a-zA-Z]:\\|^\\\\/.test(baseDir) ? "\\" : "/";
  const subDir = fileType === "video" ? "video" : "audio";
  const filePath =
    current.downloadMode === "direct"
      ? [baseDir, subDir, `${title}.${format}`].join(separator)
      : "";

  const requestId =
    body.requestId && /^[\w-]{4,64}$/.test(body.requestId)
      ? body.requestId
      : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
      duration: body.duration || "未知",
      thumbnail: body.thumbnail ?? null,
      filePath,
      status: "waiting",
      source: body.source === "extension" ? "extension" : "control-center",
    })
    .returning();

  await writeLog(
    "DOWNLOAD_QUEUED",
    `${platform} / ${fileType} / ${title} / ${quality}`,
  );

  return Response.json({
    ok: true,
    download: row,
    note:
      current.downloadMode === "ask"
        ? "下載模式為「每次都要訪問下載位置」：Desktop App 會在開始前彈出資料夾選擇視窗。"
        : "下載模式為「直接下載」：Desktop App 會存到設定的資料夾。",
  });
}
