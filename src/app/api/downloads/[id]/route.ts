import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloads } from "@/db/schema";
import { getSettings, writeLog } from "@/lib/core";

export const dynamic = "force-dynamic";

const TRANSITIONS: Record<string, string> = {
  pause: "paused",
  resume: "waiting",
  cancel: "cancelled",
  retry: "waiting",
  start: "downloading",
  fetch: "fetching",
  prepare: "preparing",
  interrupt: "interrupted",
  missing: "missing",
};

type Body = {
  action?: string;
  progress?: number;
  fileSize?: number;
  filePath?: string;
  errorMessage?: string;
  status?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await getSettings();
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ ok: false, error: "無效的 id" }, { status: 400 });
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(downloads)
    .where(eq(downloads.id, numericId));
  if (rows.length === 0) {
    return Response.json({ ok: false, error: "找不到該下載紀錄" }, { status: 404 });
  }
  const row = rows[0];
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (body.action && TRANSITIONS[body.action]) {
    update.status = TRANSITIONS[body.action];
    if (body.action === "retry") {
      update.progress = 0;
      update.errorMessage = null;
    }
    if (body.action === "cancel") update.progress = 0;
  }

  // 由 Desktop App（真正執行下載的一方）回報的真實進度
  if (typeof body.progress === "number") {
    const p = Math.max(0, Math.min(100, Math.round(body.progress)));
    update.progress = p;
    if (!update.status) update.status = p >= 100 ? "completed" : "downloading";
  }
  if (typeof body.fileSize === "number" && body.fileSize >= 0) {
    update.fileSize = Math.round(body.fileSize);
  }
  if (typeof body.filePath === "string") {
    update.filePath = body.filePath.slice(0, 500);
  }
  if (body.status === "completed") {
    update.status = "completed";
    update.progress = 100;
  }
  if (body.status === "failed") {
    update.status = "failed";
    update.errorMessage = (body.errorMessage ?? "下載失敗（未提供原因）").slice(0, 500);
  }

  const [updated] = await db
    .update(downloads)
    .set(update)
    .where(eq(downloads.id, numericId))
    .returning();

  await writeLog(
    "DOWNLOAD_STATE",
    `#${numericId} ${row.title} → ${String(update.status ?? row.status)}`,
    update.status === "failed" ? "error" : "info",
  );

  return Response.json({ ok: true, download: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await getSettings();
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ ok: false, error: "無效的 id" }, { status: 400 });
  }
  const deleted = await db
    .delete(downloads)
    .where(eq(downloads.id, numericId))
    .returning();
  if (deleted.length === 0) {
    return Response.json({ ok: false, error: "找不到該下載紀錄" }, { status: 404 });
  }
  await writeLog("HISTORY_DELETED", `#${numericId} ${deleted[0].title}`, "warn");
  return Response.json({ ok: true });
}
