// Isolated PostgreSQL/WASM, never a production connection.
// npm install --prefix <temporary-directory> --no-save @electric-sql/pglite
// node scripts/test-support-migration.mjs <temporary-directory>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { supportSecretFieldsSql } from "../src/lib/admin/support-query.ts";
const { PGlite } = await import(
  pathToFileURL(resolve(process.argv[2], "node_modules/@electric-sql/pglite/dist/index.js")).href
);
const db = new PGlite();
try {
  await db.exec(`
    CREATE TABLE organizations (id uuid PRIMARY KEY, brand_logo_key text);
    CREATE TABLE devices (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations ON DELETE CASCADE, last_screenshot_key text);
    CREATE TABLE media_assets (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations ON DELETE CASCADE, storage_key text, widget_config jsonb);
    CREATE TABLE queue_panels (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations ON DELETE CASCADE, username text UNIQUE, password_hash text DEFAULT '', theme_bg_image_key text, theme_image_key text, kiosk_logo_key text, kiosk_image_key text, kiosk_bg_image_key text, chime_storage_key text);
    CREATE TABLE queue_panel_devices (panel_id uuid REFERENCES queue_panels ON DELETE CASCADE, device_id uuid REFERENCES devices ON DELETE CASCADE, UNIQUE(device_id));
    CREATE TABLE queue_operators (id uuid PRIMARY KEY, panel_id uuid REFERENCES queue_panels ON DELETE CASCADE, username text UNIQUE, password_hash text DEFAULT '', created_at timestamptz DEFAULT now());
    CREATE TABLE queue_calls (id uuid PRIMARY KEY, panel_id uuid REFERENCES queue_panels ON DELETE CASCADE, operator_id uuid, label text);
    CREATE TABLE queue_tickets (id uuid PRIMARY KEY, panel_id uuid REFERENCES queue_panels ON DELETE CASCADE, called_by_operator_id uuid, label text);
  `);
  const migration = await readFile(
    new URL("../drizzle/0053_support_management.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration); // idempotent retry
  const projection = new PgDialect().sqlToQuery(
    sql`SELECT ${JSON.stringify({ name: "Visible", password_hash: "secret", token_hash: "secret" })}::jsonb - ${supportSecretFieldsSql()} AS record`,
  );
  assert.deepEqual((await db.query(projection.sql, projection.params)).rows[0].record, {
    name: "Visible",
  });
  const org = "10000000-0000-4000-8000-000000000001",
    panel = "20000000-0000-4000-8000-000000000002",
    device = "30000000-0000-4000-8000-000000000003";
  await db.query("INSERT INTO organizations VALUES ($1, $2)", [org, `branding/${org}/logo.webp`]);
  await db.query("INSERT INTO devices VALUES ($1,$2,$3)", [
    device,
    org,
    `org/${org}/screenshot.png`,
  ]);
  await db.query(
    "INSERT INTO queue_panels (id,organization_id,username,chime_storage_key,kiosk_image_key) VALUES ($1,$2,'reserved',$3,$4)",
    [panel, org, `org/${org}/chime.mp3`, `org/${org}/image.webp`],
  );
  await db.query("INSERT INTO queue_panel_devices VALUES ($1,$2)", [panel, device]);
  await db.query(
    "INSERT INTO queue_operators (id,panel_id,username) VALUES (gen_random_uuid(),$1,'reserved')",
    [panel],
  );
  await db.query("DELETE FROM devices WHERE id=$1", [device]);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM queue_panels")).rows[0].n,
    1,
    "terminal removal retains recoverable queue",
  );
  assert.equal((await db.query("SELECT count(*)::int n FROM queue_panel_devices")).rows[0].n, 0);
  const operatorId = (await db.query("SELECT id FROM queue_operators")).rows[0].id;
  await db.query("INSERT INTO queue_calls VALUES(gen_random_uuid(),$1,$2,'001')", [
    panel,
    operatorId,
  ]);
  await db.query("INSERT INTO queue_tickets VALUES(gen_random_uuid(),$1,$2,'001')", [
    panel,
    operatorId,
  ]);
  await db.query("DELETE FROM queue_operators WHERE id=$1", [operatorId]);
  assert.equal(
    (await db.query("SELECT operator_id,label FROM queue_calls")).rows[0].operator_id,
    null,
  );
  assert.equal(
    (await db.query("SELECT called_by_operator_id FROM queue_tickets")).rows[0]
      .called_by_operator_id,
    null,
  );
  assert.notEqual(
    (await db.query("SELECT username FROM queue_panels")).rows[0].username,
    "reserved",
    "deleting the principal releases its old login",
  );
  await db.query(
    "INSERT INTO queue_operators (id,panel_id,username) VALUES(gen_random_uuid(),$1,'reserved')",
    [panel],
  );
  await db.exec(
    "BEGIN; INSERT INTO queue_panels(id,organization_id,username) SELECT gen_random_uuid(),id,'new' FROM organizations;",
  );
  await assert.rejects(
    db.query(
      "INSERT INTO queue_operators (id,panel_id,username) VALUES(gen_random_uuid(),$1,'reserved')",
      [panel],
    ),
  );
  await db.exec("ROLLBACK");
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM queue_panels")).rows[0].n,
    1,
    "failed operator write cannot leave a partial queue",
  );
  await db.query("UPDATE queue_panels SET kiosk_image_key=$1 WHERE id=$2", [
    `org/${org}/new.webp`,
    panel,
  ]);
  assert.equal(
    (
      await db.query("SELECT count(*)::int n FROM storage_cleanup_jobs WHERE storage_key=$1", [
        `org/${org}/image.webp`,
      ])
    ).rows[0].n,
    1,
  );
  await db.query("DELETE FROM queue_panels WHERE id=$1", [panel]);
  assert.equal((await db.query("SELECT count(*)::int n FROM queue_operators")).rows[0].n, 0);
  const keys = (await db.query("SELECT storage_key FROM storage_cleanup_jobs")).rows.map(
    (r) => r.storage_key,
  );
  assert.ok(keys.includes(`org/${org}/chime.mp3`), "chime pointer survives queue deletion");
  assert.ok(keys.includes(`org/${org}/new.webp`));
  await db.query("INSERT INTO media_assets VALUES (gen_random_uuid(),$1,NULL,$2::jsonb)", [
    org,
    JSON.stringify({
      theme: { backgroundImageKey: `org/${org}/widget.webp` },
      layout: { block: { backgroundImageKey: `org/${org}/block.webp` } },
    }),
  ]);
  await db.query("DELETE FROM organizations WHERE id=$1", [org]);
  const allKeys = (await db.query("SELECT storage_key FROM storage_cleanup_jobs")).rows.map(
    (r) => r.storage_key,
  );
  assert.ok(allKeys.includes(`branding/${org}/logo.webp`));
  assert.ok(allKeys.includes(`org/${org}/widget.webp`));
  assert.ok(allKeys.includes(`org/${org}/block.webp`));
  const otherOrg = "40000000-0000-4000-8000-000000000004";
  await db.query("INSERT INTO organizations VALUES ($1,NULL)", [otherOrg]);
  await db.query("INSERT INTO media_assets VALUES(gen_random_uuid(),$1,$2,$3::jsonb)", [
    otherOrg,
    `org/${org}/foreign.mp4`,
    JSON.stringify({ theme: { backgroundImageKey: `org/${org}/foreign.webp` } }),
  ]);
  await db.query("DELETE FROM organizations WHERE id=$1", [otherOrg]);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM storage_cleanup_jobs WHERE storage_key LIKE '%foreign.%'",
      )
    ).rows[0].n,
    0,
    "tenant cannot enqueue a foreign file through config JSON",
  );
  console.log(
    "PASS: migration retry, detached queue, namespace rollback, FK cascade, image/chime/logo/widget cleanup outbox.",
  );
} finally {
  await db.close();
}
