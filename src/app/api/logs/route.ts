import { desc } from "drizzle-orm";
import { db } from "@/db";
import { logs } from "@/db/schema";
import { getSettings } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  await getSettings();
  const rows = await db.select().from(logs).orderBy(desc(logs.id)).limit(60);
  return Response.json({ ok: true, logs: rows });
}
