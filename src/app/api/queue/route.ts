import { sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads } from "@/db/schema";
import { getSettings, writeLog } from "@/lib/core";

export const dynamic = "force-dynamic";

/** 佇列整體控制：暫停全部 / 恢復全部 / 恢復中斷任務 */
export async function POST(request: Request) {
  await getSettings();
  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action === "pause-all") {
    const rows = await db
      .update(downloads)
      .set({ status: "paused", updatedAt: new Date() })
      .where(sql`${downloads.status} in ('waiting','downloading','preparing','fetching')`)
      .returning();
    await writeLog("QUEUE_PAUSED", `${rows.length} 個任務`);
    return Response.json({ ok: true, affected: rows.length, state: "paused" });
  }
  if (action === "resume-all") {
    const rows = await db
      .update(downloads)
      .set({ status: "waiting", updatedAt: new Date() })
      .where(sql`${downloads.status} in ('paused')`)
      .returning();
    await writeLog("QUEUE_RESUMED", `${rows.length} 個任務`);
    return Response.json({ ok: true, affected: rows.length, state: "running" });
  }
  if (action === "recover") {
    const rows = await db
      .update(downloads)
      .set({ status: "waiting", progress: 0, updatedAt: new Date() })
      .where(sql`${downloads.status} = 'interrupted'`)
      .returning();
    await writeLog("CRASH_RECOVERY", `恢復 ${rows.length} 個未完成下載`);
    return Response.json({ ok: true, affected: rows.length });
  }
  if (action === "drop-interrupted") {
    const rows = await db
      .delete(downloads)
      .where(sql`${downloads.status} = 'interrupted'`)
      .returning();
    await writeLog("CRASH_RECOVERY", `刪除 ${rows.length} 個未完成任務`, "warn");
    return Response.json({ ok: true, affected: rows.length });
  }
  return Response.json({ ok: false, error: "不支援的佇列指令" }, { status: 400 });
}
