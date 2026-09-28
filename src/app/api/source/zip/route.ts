import fs from "node:fs/promises";
import JSZip from "jszip";
import { SOURCE_ROOT, listSourceFiles } from "@/lib/source";
import { writeLog } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const files = await listSourceFiles();
  if (files.length === 0) {
    return Response.json({ ok: false, error: "沒有可打包的原始碼" }, { status: 404 });
  }
  const zip = new JSZip();
  for (const file of files) {
    const buffer = await fs.readFile(`${SOURCE_ROOT}/${file.path}`);
    zip.file(`AhYooVideoBackup/${file.path}`, buffer);
  }
  const content = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await writeLog("SOURCE_EXPORTED", `${files.length} 個檔案`);
  return new Response(new Uint8Array(content), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="AhYooVideoBackup-v1.0.zip"',
      "cache-control": "no-store",
    },
  });
}
