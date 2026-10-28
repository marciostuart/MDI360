import { z } from "zod";

const name = z.string().trim().min(1).max(160);
const username = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-zA-Z0-9_.-]+$/);
// Explicit allowlist: support never exposes an arbitrary SQL/table editor.
export const SUPPORT_RESOURCES = {
  organizations: { label: "Empresas", edit: z.object({ name }).strict(), deletable: false },
  users: {
    label: "Usuários do Studio",
    edit: z
      .object({
        name,
        email: z.string().trim().email(),
        is_active: z.boolean(),
        roles: z
          .array(z.enum(["owner", "admin", "operator"]))
          .min(1)
          .max(3),
        password: z.string().min(8).max(128).optional(),
      })
      .strict(),
    deletable: true,
  },
  devices: {
    label: "Telas / terminais",
    edit: z.object({ name, status: z.enum(["active", "blocked"]) }).strict(),
    deletable: true,
  },
  media_assets: { label: "Mídias / widgets", edit: z.object({ name }).strict(), deletable: true },
  queue_panels: {
    label: "Filas (inclusive sem terminal)",
    edit: z
      .object({
        name,
        is_enabled: z.boolean(),
        clear_file_slot: z
          .enum([
            "theme_bg_image_key",
            "theme_image_key",
            "kiosk_logo_key",
            "kiosk_image_key",
            "kiosk_bg_image_key",
            "chime_storage_key",
          ])
          .optional(),
      })
      .strict(),
    deletable: true,
  },
  queue_operators: {
    label: "Operadores / guichês",
    edit: z
      .object({
        name,
        username,
        desk_label: z.string().trim().max(40).nullable(),
        is_enabled: z.boolean(),
        password: z.string().min(8).max(128).optional(),
      })
      .strict(),
    deletable: true,
  },
  queue_sectors: {
    label: "Setores",
    edit: z.object({ name, issuing_enabled: z.boolean() }).strict(),
    deletable: true,
  },
  queue_emitters: { label: "Emissores", edit: z.object({ name }).strict(), deletable: true },
  locations: {
    label: "Unidades",
    edit: z
      .object({ name, address: z.string().max(500).nullable(), timezone: z.string().max(80) })
      .strict(),
    deletable: true,
  },
  playlists: {
    label: "Playlists",
    edit: z.object({ name, description: z.string().max(2000).nullable() }).strict(),
    deletable: true,
  },
  schedules: {
    label: "Agendamentos",
    edit: z
      .object({ is_active: z.boolean(), priority: z.number().int().min(-32768).max(32767) })
      .strict(),
    deletable: true,
  },
  queue_tickets: { label: "Senhas emitidas", edit: z.object({}).strict(), deletable: false },
  queue_calls: { label: "Chamadas", edit: z.object({}).strict(), deletable: false },
  playback_events: {
    label: "Exibições / relatórios",
    edit: z.object({}).strict(),
    deletable: false,
  },
  support_actions: { label: "Auditoria de suporte", edit: z.object({}).strict(), deletable: false },
  storage_cleanup_jobs: {
    label: "Limpezas de arquivos pendentes",
    edit: z.object({}).strict(),
    deletable: false,
  },
} as const;
export type SupportResource = keyof typeof SUPPORT_RESOURCES;
export type SupportJson =
  string | number | boolean | null | SupportJson[] | { [key: string]: SupportJson };
export const supportResourceSchema = z.enum(
  Object.keys(SUPPORT_RESOURCES) as [SupportResource, ...SupportResource[]],
);
export const SUPPORT_SECRET_FIELDS = [
  "password_hash",
  "token_hash",
  "kiosk_token",
  "pairing_code",
  "idempotency_key",
];
export function editableSupportValues(resource: SupportResource, row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(SUPPORT_RESOURCES[resource].edit.shape)
      .filter((key) => key !== "password" && key !== "clear_file_slot")
      .map((key) => [key, row[key] ?? null]),
  );
}
export function storageKeyBelongsToOrganization(key: string, organizationId: string) {
  return (
    (key.startsWith(`org/${organizationId}/`) || key.startsWith(`branding/${organizationId}/`)) &&
    !key.split("/").some((part) => part === "." || part === "..")
  );
}
