import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  isMatureOrphanDate,
  isOwnedTemporaryDirectory,
  orphanOrganizationId,
} from "../src/lib/admin/orphan-sweep-policy.ts";
import { sweepOwnedTemporaryDirectories } from "../src/lib/admin/orphan-temp.server.ts";

test("orphan policy restricts tenant roots, traversal and recent objects", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.equal(orphanOrganizationId(`org/${id}/media/file.mp4`, "org"), id);
  for (const key of [
    `org/${id}/../file.mp4`,
    `org/${id}//file.mp4`,
    `other/${id}/file`,
    `org/not-a-uuid/file`,
    `org/${id}/file?query`,
  ])
    assert.equal(orphanOrganizationId(key, "org"), null);
  assert.equal(isMatureOrphanDate(null), false);
  assert.equal(isMatureOrphanDate(new Date()), false);
  assert.equal(isMatureOrphanDate(new Date(Date.now() - 25 * 60 * 60 * 1000)), true);
  assert.equal(isOwnedTemporaryDirectory("mdi360-video-ABC123"), true);
  assert.equal(isOwnedTemporaryDirectory("mdi360-video-../important"), false);
});

test("local cleanup touches only old recognized conversion directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdi360-cleanup-test-"));
  assert.equal(dirname(root), tmpdir().replace(/[\\/]$/, ""));
  try {
    const old = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const stale = join(root, "mdi360-video-ABC123");
    const recent = join(root, "mdi360-image-ABC124");
    const unknown = join(root, "mdi360-video-ABC125");
    for (const dir of [stale, recent, unknown]) await mkdir(dir);
    await writeFile(join(stale, "input.bin"), "test");
    await writeFile(join(recent, "input.bin"), "test");
    await writeFile(join(unknown, "do-not-delete.txt"), "test");
    await utimes(join(stale, "input.bin"), old, old);
    await utimes(join(unknown, "do-not-delete.txt"), old, old);
    await utimes(stale, old, old);
    await utimes(unknown, old, old);
    const audited: string[] = [];
    const preview = await sweepOwnedTemporaryDirectories(async (name) => {
      audited.push(name);
    }, root, true);
    assert.equal(preview.eligible, 1);
    assert.equal(preview.deleted, 0);
    assert.deepEqual(audited, []);
    assert.ok((await stat(stale)).isDirectory());
    const result = await sweepOwnedTemporaryDirectories(async (name) => {
      audited.push(name);
    }, root);
    assert.equal(result.deleted, 1);
    assert.deepEqual(audited, ["mdi360-video-ABC123"]);
    await assert.rejects(() => stat(stale));
    assert.ok((await stat(recent)).isDirectory());
    assert.ok((await stat(unknown)).isDirectory());
  } finally {
    // root is the uniquely generated temporary test directory checked above.
    await rm(root, { recursive: true, force: true });
  }
});
