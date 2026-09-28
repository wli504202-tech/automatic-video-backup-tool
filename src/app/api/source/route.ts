import { listSourceFiles, readSourceFile } from "@/lib/source";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");
  if (file) {
    const content = await readSourceFile(file);
    if (content === null) {
      return Response.json({ ok: false, error: "找不到檔案" }, { status: 404 });
    }
    return Response.json({ ok: true, path: file, content });
  }
  const files = await listSourceFiles();
  return Response.json({ ok: true, files, count: files.length });
}
