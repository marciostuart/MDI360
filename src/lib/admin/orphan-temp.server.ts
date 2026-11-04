import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isMatureOrphanDate, isOwnedTemporaryDirectory } from "./orphan-sweep-policy.ts";

const ALLOWED_FILES = new Set(["input.bin", "output.mp4", "output.png"]);

/** Only abandoned conversion directories in the current application container. */
export async function sweepOwnedTemporaryDirectories(
  audit: (name: string) => Promise<void>,
  rootPath = tmpdir(),
  preview = false,
) {
  const root = await realpath(rootPath);
  const entries = await readdir(root, { withFileTypes: true });
  let eligible = 0,
    deleted = 0,
    skipped = 0,
    failed = 0;
  for (const entry of entries) {
    if (!isOwnedTemporaryDirectory(entry.name)) continue;
    const target = join(root, entry.name);
    try {
      const stat = await lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !isMatureOrphanDate(stat.mtime)) {
        skipped++;
        continue;
      }
      const resolved = await realpath(target);
      if (dirname(resolved) !== root || resolved !== target) {
        skipped++;
        continue;
      }
      const children = await readdir(target, { withFileTypes: true });
      let safe = true;
      for (const child of children) {
        if (!ALLOWED_FILES.has(child.name) || !child.isFile() || child.isSymbolicLink()) {
          safe = false;
          break;
        }
        const info = await lstat(join(target, child.name));
        if (!info.isFile() || info.isSymbolicLink() || !isMatureOrphanDate(info.mtime)) {
          safe = false;
          break;
        }
      }
      if (!safe) {
        skipped++;
        continue;
      }
      eligible++;
      if (preview) continue;
      await audit(entry.name);
      const latest = await lstat(target);
      if (
        !latest.isDirectory() ||
        latest.isSymbolicLink() ||
        latest.ino !== stat.ino ||
        latest.dev !== stat.dev ||
        !isMatureOrphanDate(latest.mtime)
      ) {
        skipped++;
        continue;
      }
      const finalChildren = await readdir(target, { withFileTypes: true });
      if (finalChildren.length !== children.length) {
        skipped++;
        continue;
      }
      for (const child of finalChildren) {
        if (!ALLOWED_FILES.has(child.name) || !child.isFile() || child.isSymbolicLink()) {
          safe = false;
          break;
        }
        const info = await lstat(join(target, child.name));
        if (!info.isFile() || info.isSymbolicLink() || !isMatureOrphanDate(info.mtime)) {
          safe = false;
          break;
        }
      }
      if (!safe) {
        skipped++;
        continue;
      }
      // The target is a verified immediate child of tmpdir with a strict app prefix.
      await rm(target, { recursive: true, force: false });
      deleted++;
    } catch {
      failed++;
    }
  }
  return { eligible, deleted, skipped, failed };
}
