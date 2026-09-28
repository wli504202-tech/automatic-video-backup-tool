import fs from "node:fs/promises";
import path from "node:path";

export const SOURCE_ROOT = path.join(process.cwd(), "resources", "AhYooVideoBackup");

export type SourceFile = { path: string; size: number };

export async function listSourceFiles(dir = SOURCE_ROOT): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  async function walk(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        out.push({
          path: path.relative(SOURCE_ROOT, full).split(path.sep).join("/"),
          size: stat.size,
        });
      }
    }
  }
  await walk(dir);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export function resolveSafe(relative: string): string | null {
  const normalized = path
    .normalize(relative)
    .replace(/^([.][.][/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const full = path.join(SOURCE_ROOT, normalized);
  if (!full.startsWith(SOURCE_ROOT)) return null;
  return full;
}

export async function readSourceFile(relative: string): Promise<string | null> {
  const full = resolveSafe(relative);
  if (!full) return null;
  try {
    return await fs.readFile(full, "utf8");
  } catch {
    return null;
  }
}
