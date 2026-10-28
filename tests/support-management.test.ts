import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { supportStorageKeys } from "../src/lib/admin/support-query.ts";
import {
  SUPPORT_RESOURCES,
  SUPPORT_SECRET_FIELDS,
  editableSupportValues,
  storageKeyBelongsToOrganization,
  supportResourceSchema,
} from "../src/lib/admin/support-resources.ts";

test("support only accepts known resources and explicitly editable fields", () => {
  assert.equal(supportResourceSchema.safeParse("sessions").success, false);
  assert.equal(supportResourceSchema.safeParse("users; DROP TABLE users").success, false);
  assert.equal(
    SUPPORT_RESOURCES.users.edit.safeParse({
      name: "Maria",
      email: "maria@example.com",
      is_active: true,
      organization_id: "other",
    }).success,
    false,
  );
  assert.equal(
    SUPPORT_RESOURCES.devices.edit.safeParse({ name: "TV", status: "active", token_hash: "secret" })
      .success,
    false,
  );
  assert.equal(
    SUPPORT_RESOURCES.users.edit.safeParse({
      name: "Maria",
      email: "maria@example.com",
      is_active: true,
      password: "short",
    }).success,
    false,
  );
});

test("edits do not hydrate passwords, IDs, tenancy or login tokens", () => {
  assert.deepEqual(
    editableSupportValues("users", {
      id: "id",
      name: "Maria",
      email: "maria@example.com",
      is_active: true,
      password_hash: "secret",
      token_hash: "secret",
      roles: ["owner"],
    }),
    { name: "Maria", email: "maria@example.com", is_active: true, roles: ["owner"] },
  );
  assert.ok(SUPPORT_SECRET_FIELDS.includes("password_hash"));
  assert.ok(SUPPORT_SECRET_FIELDS.includes("kiosk_token"));
});

test("file cleanup accepts exact tenant roots, not siblings or traversal", () => {
  assert.equal(storageKeyBelongsToOrganization("org/company/media/a.mp4", "company"), true);
  assert.equal(storageKeyBelongsToOrganization("branding/company/logo.png", "company"), true);
  for (const key of [
    "org/company-other/file",
    "org/other/file",
    "org/company/../other/file",
    "",
    "org/company",
  ])
    assert.equal(storageKeyBelongsToOrganization(key, "company"), false);
});

test("individual cleanup collects only the selected record's files", () => {
  assert.deepEqual(supportStorageKeys("devices", { last_screenshot_key: null }), []);
  assert.deepEqual(
    supportStorageKeys("queue_panels", {
      chime_storage_key: "one.mp3",
      kiosk_image_key: "one.webp",
      storage_key: "unrelated",
    }).sort(),
    ["one.mp3", "one.webp"],
  );
  assert.deepEqual(
    supportStorageKeys("media_assets", {
      storage_key: "video.mp4",
      widget_config: { layout: { a: { backgroundImageKey: "bg.webp" } } },
    }).sort(),
    ["bg.webp", "video.mp4"],
  );
});

test("queue save is atomic and checks the operator namespace before creating panel", () => {
  const source = readFileSync(
    new URL("../src/lib/queue/queue.functions.ts", import.meta.url),
    "utf8",
  );
  const save = source.slice(
    source.indexOf("export const saveQueuePanel"),
    source.indexOf("export const setQueuePanelDevices"),
  );
  assert.match(save, /await db\.transaction/);
  assert.ok(save.indexOf("const operatorTaken") < save.indexOf("const created"));
});

test("all support endpoints require platform authorization", () => {
  const source = readFileSync(
    new URL("../src/lib/admin/support.functions.ts", import.meta.url),
    "utf8",
  );
  for (const block of source.split("export const ").slice(1))
    assert.match(block, /await requirePlatformAdmin\(\)/);
  assert.match(source, /data\.confirmation !== data\.id/);
  assert.match(source, /FOR UPDATE OF r/);
  assert.match(source, /INSERT INTO support_actions/);
  assert.match(source, /86_400_000/);
});
