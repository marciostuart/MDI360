import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  SUPPORT_RESOURCES,
  supportResourceSchema,
  storageKeyBelongsToOrganization,
  type SupportResource,
  type SupportJson,
} from "./support-resources";
import { supportSecretFieldsSql, supportStorageKeys } from "./support-query";

const listInput = z.object({
  resource: supportResourceSchema,
  organizationId: z.string().uuid().optional(),
  search: z.string().trim().max(100).default(""),
  page: z.number().int().min(0).max(10000).default(0),
  detachedOnly: z.boolean().default(false),
});
const mutationInput = z.object({
  resource: supportResourceSchema,
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  reason: z.string().trim().min(5).max(500),
});

// Identifiers/joins are constants, never request-supplied SQL.
function scope(resource: SupportResource) {
  if (resource === "organizations") return { join: "", org: "r.id" };
  if (["queue_operators", "queue_sectors", "queue_calls", "queue_tickets"].includes(resource))
    return { join: "LEFT JOIN queue_panels p ON p.id = r.panel_id", org: "p.organization_id" };
  return { join: "", org: "r.organization_id" };
}

export const listSupportOrganizations = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePlatformAdmin } = await import("./admin-auth.server");
  await requirePlatformAdmin();
  const { getDb, schema } = await import("@/lib/db/index.server");
  return getDb()
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.organizations)
    .orderBy(schema.organizations.name);
});

export const listSupportRecords = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    await requirePlatformAdmin();
    const { getDb } = await import("@/lib/db/index.server");
    const { sql } = await import("drizzle-orm");
    const db = getDb(),
      s = scope(data.resource);
    const base = sql`to_jsonb(r) - ${supportSecretFieldsSql()}`;
    const safe =
      data.resource === "users"
        ? sql`(${base}) || jsonb_build_object('roles', COALESCE((SELECT jsonb_agg(role) FROM user_roles WHERE user_id = r.id), '[]'::jsonb))`
        : data.resource === "queue_panels"
          ? sql`(${base}) || jsonb_build_object('terminals', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name)) FROM queue_panel_devices qpd JOIN devices d ON d.id=qpd.device_id WHERE qpd.panel_id=r.id),'[]'::jsonb))`
          : data.resource === "queue_operators"
            ? sql`(${base}) || jsonb_build_object('sector_ids', COALESCE((SELECT jsonb_agg(sector_id) FROM queue_operator_sectors WHERE operator_id=r.id),'[]'::jsonb))`
            : data.resource === "playlists"
              ? sql`(${base}) || jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.position) FROM playlist_items pi WHERE pi.playlist_id=r.id),'[]'::jsonb))`
              : base;
    const where = sql`WHERE (${data.organizationId ?? null}::uuid IS NULL OR ${sql.raw(s.org)} = ${data.organizationId ?? null}::uuid)
    AND (${data.search} = '' OR strpos(lower((${safe})::text), lower(${data.search})) > 0)
    ${data.detachedOnly && data.resource === "queue_panels" ? sql`AND NOT EXISTS (SELECT 1 FROM queue_panel_devices d WHERE d.panel_id = r.id)` : sql``}
    ${data.resource === "storage_cleanup_jobs" ? sql`AND r.deleted_at IS NULL` : sql``}`;
    const from = sql`FROM ${sql.identifier(data.resource)} r ${sql.raw(s.join)} LEFT JOIN organizations o ON o.id = ${sql.raw(s.org)}`;
    const counts = await db.execute(sql`SELECT count(*)::int AS total ${from} ${where}`);
    const rows =
      await db.execute(sql`SELECT ${safe} AS record, o.name AS organization_name, ${sql.raw(s.org)} AS organization_id,
    ${data.resource === "queue_panels" ? sql`(SELECT count(*)::int FROM queue_panel_devices d WHERE d.panel_id = r.id)` : sql`NULL`} AS linked_terminals
    ${from} ${where} ORDER BY ${sql.raw(data.resource === "queue_tickets" ? "r.issued_at" : data.resource === "playback_events" ? "r.started_at" : "r.created_at")} DESC, r.id LIMIT 50 OFFSET ${data.page * 50}`);
    return {
      total: Number(counts.rows[0]?.total ?? 0),
      items: rows.rows as {
        record: Record<string, SupportJson>;
        organization_name: string | null;
        organization_id: string | null;
        linked_terminals: number | null;
      }[],
    };
  });

export const mutateSupportRecord = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    mutationInput
      .extend({
        action: z.enum(["edit", "delete"]),
        values: z.record(z.unknown()).default({}),
        confirmation: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    const admin = await requirePlatformAdmin();
    const { getDb } = await import("@/lib/db/index.server");
    const { sql } = await import("drizzle-orm");
    const resource = SUPPORT_RESOURCES[data.resource];
    if (data.action === "delete" && (!resource.deletable || data.confirmation !== data.id))
      throw new Error("Confirme a exclusão digitando o ID completo.");
    const values =
      data.action === "edit" ? (resource.edit.parse(data.values) as Record<string, unknown>) : {};
    if (data.action === "edit" && !Object.keys(values).length)
      throw new Error("Registro disponível somente para consulta.");
    const s = scope(data.resource),
      db = getDb();
    let removedDeviceName: string | null = null;
    let removedFileKeys: string[] = [];
    await db.transaction(async (tx) => {
      const selected = await tx.execute(
        sql`SELECT to_jsonb(r) AS record, ${sql.raw(s.org)} AS org FROM ${sql.identifier(data.resource)} r ${sql.raw(s.join)} WHERE r.id = ${data.id}::uuid FOR UPDATE OF r`,
      );
      const row = selected.rows[0]?.record as Record<string, unknown> | undefined;
      if (!row || (selected.rows[0].org ?? null) !== data.organizationId)
        throw new Error("Registro não encontrado neste estabelecimento. Atualize a lista.");
      if (data.resource === "users") {
        const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
          .split(",")
          .map((v) => v.trim().toLowerCase());
        if (
          data.id === admin.id ||
          admins.includes(String(row.email).toLowerCase()) ||
          (typeof values.email === "string" && admins.includes(values.email.toLowerCase()))
        )
          throw new Error("Usuários da plataforma são protegidos nesta ferramenta.");
        await tx.execute(
          sql`SELECT id FROM organizations WHERE id = ${data.organizationId}::uuid FOR UPDATE`,
        );
        if (
          data.action === "delete" ||
          values.is_active === false ||
          (Array.isArray(values.roles) && !values.roles.includes("owner"))
        ) {
          const owners = await tx.execute(
            sql`SELECT u.id FROM users u JOIN user_roles role ON role.user_id = u.id AND role.role = 'owner' WHERE u.organization_id = ${data.organizationId}::uuid AND u.is_active`,
          );
          if (owners.rows.some((u) => u.id === data.id) && owners.rows.length <= 1)
            throw new Error("Mantenha pelo menos um proprietário ativo na empresa.");
        }
      }
      if (data.action === "delete") {
        removedFileKeys = supportStorageKeys(data.resource, row);
        if (data.resource === "devices" && data.organizationId)
          removedDeviceName = String(row.name);
        if (data.resource === "playlists")
          await tx.execute(
            sql`UPDATE devices SET default_playlist_id = NULL WHERE default_playlist_id = ${data.id}::uuid`,
          );
        if (data.resource === "queue_operators") {
          await tx.execute(
            sql`UPDATE queue_calls SET operator_id = NULL WHERE operator_id = ${data.id}::uuid`,
          );
          await tx.execute(
            sql`UPDATE queue_tickets SET called_by_operator_id = NULL WHERE called_by_operator_id = ${data.id}::uuid`,
          );
        }
        await tx.execute(
          sql`DELETE FROM ${sql.identifier(data.resource)} WHERE id = ${data.id}::uuid`,
        );
      } else {
        const assignments = [];
        for (const [key, value] of Object.entries(values)) {
          if (key === "roles") continue;
          if (key === "clear_file_slot") {
            if (typeof row[String(value)] === "string")
              removedFileKeys.push(String(row[String(value)]));
            assignments.push(sql`${sql.identifier(String(value))} = NULL`);
            if (value === "chime_storage_key") assignments.push(sql`chime_name = NULL`);
            if (value === "theme_bg_image_key") assignments.push(sql`theme_bg_media_id = NULL`);
            if (value === "kiosk_bg_image_key") assignments.push(sql`kiosk_bg_media_id = NULL`);
          } else if (key === "password") {
            const { hashPassword } = await import("@/lib/auth/session.server");
            assignments.push(sql`password_hash = ${await hashPassword(String(value))}`);
          } else assignments.push(sql`${sql.identifier(key)} = ${value}`);
        }
        await tx.execute(
          sql`UPDATE ${sql.identifier(data.resource)} SET ${sql.join(assignments, sql`, `)} WHERE id = ${data.id}::uuid`,
        );
        if (data.resource === "queue_operators" && values.username !== row.username)
          await tx.execute(
            sql`UPDATE queue_panels SET username = ${values.username} WHERE id = ${row.panel_id}::uuid AND username = ${row.username}`,
          );
        if (data.resource === "users")
          await tx.execute(sql`DELETE FROM sessions WHERE user_id = ${data.id}::uuid`);
        if (data.resource === "users") {
          await tx.execute(sql`DELETE FROM account_action_tokens WHERE user_id = ${data.id}::uuid`);
          await tx.execute(sql`DELETE FROM user_roles WHERE user_id = ${data.id}::uuid`);
          for (const role of new Set(values.roles as string[]))
            await tx.execute(
              sql`INSERT INTO user_roles (user_id,role) VALUES (${data.id}::uuid,${role}::app_role)`,
            );
        }
        if (data.resource === "queue_operators")
          await tx.execute(sql`DELETE FROM queue_sessions WHERE operator_id = ${data.id}::uuid`);
      }
      await tx.execute(sql`INSERT INTO support_actions (actor_id, organization_id, resource, record_id, action, reason, changed_fields)
      VALUES (${admin.id}::uuid, ${data.organizationId}::uuid, ${data.resource}, ${data.id}, ${data.action}, ${data.reason}, ${JSON.stringify(Object.keys(values))}::jsonb)`);
    });
    if (removedDeviceName && data.organizationId) {
      const { creditDeviceRemoval } = await import("@/lib/billing/billing.server");
      await creditDeviceRemoval(data.organizationId, data.id, removedDeviceName);
    }
    const { notifyOrganization, notifyDevice } = await import("@/lib/player/realtime.server");
    notifyOrganization(data.organizationId);
    if (data.resource === "devices") notifyDevice(data.id);
    const { retryStorageCleanup } = await import("./storage-cleanup.server");
    const cleanup =
      data.organizationId && removedFileKeys.length
        ? await retryStorageCleanup(data.organizationId, removedFileKeys)
        : null;
    return { ok: true, cleanup };
  });

export const attachSupportQueue = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        panelId: z.string().uuid(),
        deviceId: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    const admin = await requirePlatformAdmin();
    const { getDb } = await import("@/lib/db/index.server");
    const { sql } = await import("drizzle-orm");
    await getDb().transaction(async (tx) => {
      const valid = await tx.execute(
        sql`SELECT p.id FROM queue_panels p JOIN devices d ON d.organization_id = p.organization_id WHERE p.id = ${data.panelId}::uuid AND d.id = ${data.deviceId}::uuid AND p.organization_id = ${data.organizationId}::uuid AND d.status <> 'pending' FOR UPDATE OF p, d`,
      );
      if (!valid.rows[0]) throw new Error("Fila e terminal devem pertencer à mesma empresa.");
      await tx.execute(
        sql`INSERT INTO queue_panel_devices (panel_id, device_id) VALUES (${data.panelId}::uuid, ${data.deviceId}::uuid) ON CONFLICT (device_id) DO NOTHING`,
      );
      const link = await tx.execute(
        sql`SELECT panel_id FROM queue_panel_devices WHERE device_id = ${data.deviceId}::uuid`,
      );
      if (link.rows[0]?.panel_id !== data.panelId)
        throw new Error("O terminal já pertence a outra fila. O vínculo existente foi preservado.");
      await tx.execute(
        sql`INSERT INTO support_actions (actor_id, organization_id, resource, record_id, action, reason) VALUES (${admin.id}::uuid, ${data.organizationId}::uuid, 'queue_panels', ${data.panelId}, 'attach', ${data.reason})`,
      );
    });
    const { notifyOrganization, notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);
    notifyOrganization(data.organizationId);
    return { ok: true };
  });

const storageInput = z.object({
  organizationId: z.string().uuid().optional(),
  area: z.enum(["org", "branding"]).default("org"),
  cursor: z.string().max(4000).optional(),
});
export const listSupportFiles = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => storageInput.parse(input))
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    await requirePlatformAdmin();
    const { listStorageObjects } = await import("@/lib/storage.server");
    const { isStorageKeyReferenced } = await import("./storage-cleanup.server");
    const page = await listStorageObjects(
      `${data.area}/${data.organizationId ? `${data.organizationId}/` : ""}`,
      data.cursor,
    );
    return {
      ...page,
      items: await Promise.all(
        page.items.map(async (file) => ({
          ...file,
          organizationId: z.string().uuid().safeParse(file.key.split("/")[1]).success
            ? file.key.split("/")[1]
            : null,
          referenced: await isStorageKeyReferenced(file.key),
          mature: Boolean(
            file.modifiedAt && Date.now() - new Date(file.modifiedAt).getTime() >= 86_400_000,
          ),
        })),
      ),
    };
  });

export const deleteSupportOrphanFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        key: z.string().min(1).max(2000),
        confirmation: z.string(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    const admin = await requirePlatformAdmin();
    if (
      data.confirmation !== data.key ||
      !storageKeyBelongsToOrganization(data.key, data.organizationId)
    )
      throw new Error("Confirme a chave exata dentro da empresa selecionada.");
    const { isStorageKeyReferenced, retryStorageCleanup } =
      await import("./storage-cleanup.server");
    if (await isStorageKeyReferenced(data.key))
      throw new Error(
        "Arquivo em uso: exclua a mídia ou remova o vínculo no cadastro correspondente primeiro.",
      );
    const { getDb } = await import("@/lib/db/index.server");
    const { sql } = await import("drizzle-orm");
    const { getStorageObjectModifiedAt } = await import("@/lib/storage.server");
    const modified = await getStorageObjectModifiedAt(data.key);
    if (!modified || Date.now() - modified.getTime() < 86_400_000)
      throw new Error("Só é permitido remover órfãos com mais de 24 horas.");
    await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO storage_cleanup_jobs (organization_id, storage_key) VALUES (${data.organizationId}::uuid, ${data.key}) ON CONFLICT (storage_key) DO UPDATE SET deleted_at = NULL`,
      );
      await tx.execute(
        sql`INSERT INTO support_actions (actor_id, organization_id, resource, record_id, action, reason) VALUES (${admin.id}::uuid, ${data.organizationId}::uuid, 'storage', ${data.key}, 'delete', ${data.reason})`,
      );
    });
    return retryStorageCleanup(data.organizationId, [data.key]);
  });

export const retrySupportCleanup = createServerFn({ method: "POST" }).handler(async () => {
  const { requirePlatformAdmin } = await import("./admin-auth.server");
  const admin = await requirePlatformAdmin();
  const { getDb } = await import("@/lib/db/index.server");
  const { sql } = await import("drizzle-orm");
  const { isStorageConfigured } = await import("@/lib/storage.server");
  if (!isStorageConfigured())
    throw new Error(
      "Armazenamento indisponível. As exclusões continuam registradas para nova tentativa.",
    );
  await getDb().execute(
    sql`INSERT INTO support_actions (actor_id,resource,record_id,action,reason) VALUES (${admin.id}::uuid,'storage_cleanup_jobs','batch','retry','Reprocessamento manual confirmado na Torre')`,
  );
  const { retryStorageCleanup } = await import("./storage-cleanup.server");
  return retryStorageCleanup();
});
