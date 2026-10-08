import { eq, sql } from "drizzle-orm";

/**
 * Tiny in-process broadcast bus used to push content changes to TVs.
 *
 * Screens keep one cheap long-poll connection open ("aguarde até algo mudar").
 * When the Studio changes a playlist, schedule or device, we bump a revision
 * counter and immediately release every waiter of that organization/device,
 * so the TV re-syncs in well under a second instead of waiting for the next
 * periodic poll. No database polling, no extra queries: a waiting request only
 * costs one idle socket + a timer, which keeps the VPS load flat.
 */

type Waiter = {
  since: number;
  resolve: (revision: number) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Bus = {
  orgRevision: Map<string, number>;
  deviceRevision: Map<string, number>;
  queuePanelRevision: Map<string, number>;
  waiters: Map<string, Set<Waiter>>;
};

// Survives HMR in dev and module re-evaluation in the worker.
const globalRef = globalThis as unknown as { __mdiPlayerBus?: Bus };
const bus: Bus =
  globalRef.__mdiPlayerBus ??
  (globalRef.__mdiPlayerBus = {
    orgRevision: new Map(),
    deviceRevision: new Map(),
    queuePanelRevision: new Map(),
    waiters: new Map(),
  });

// Keeps compatibility with a bus created by an older module during HMR.
bus.queuePanelRevision ??= new Map();

/** Maximum time a screen holds a long-poll open before we answer "nada novo". */
export const LONG_POLL_TIMEOUT_MS = 25_000;

/** Current revision a screen should compare against. */
export function revisionFor(deviceId: string, organizationId: string | null): number {
  const org = organizationId ? (bus.orgRevision.get(organizationId) ?? 0) : 0;
  const device = bus.deviceRevision.get(deviceId) ?? 0;
  return Math.max(org, device);
}

function releaseWaiters(key: string) {
  const set = bus.waiters.get(key);
  if (!set) return;
  for (const waiter of set) {
    clearTimeout(waiter.timer);
    // The exact number does not matter, only that it moved forward.
    waiter.resolve(Date.now());
  }
  bus.waiters.delete(key);
}

/** Called by the Studio whenever content of an organization changed. */
export function notifyOrganization(organizationId: string | null | undefined) {
  if (!organizationId) return;
  bus.orgRevision.set(organizationId, Date.now());
  releaseWaiters(`org:${organizationId}`);
  void persistRevision("organization", organizationId);
}

/** Called when a single screen must react (command, playlist swap, unlink). */
export function notifyDevice(deviceId: string) {
  bus.deviceRevision.set(deviceId, Date.now());
  releaseWaiters(`device:${deviceId}`);
  void persistRevision("device", deviceId);
}

/**
 * Stores the invalidation in PostgreSQL as a safety net for process restarts
 * and multiple replicas. The in-memory bus still wakes connected screens
 * immediately; this write is deliberately fire-and-forget and never blocks a
 * Studio mutation if the database is temporarily unavailable.
 */
async function persistRevision(kind: "organization" | "device", id: string) {
  try {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const table = kind === "organization" ? schema.organizations : schema.devices;
    await getDb()
      .update(table)
      .set({ playerRevision: sql`greatest(${table.playerRevision} + 1, ${Date.now()})` })
      .where(eq(table.id, id));
  } catch (error) {
    console.warn("[player] nÃ£o foi possÃ­vel persistir a revisÃ£o de invalidaÃ§Ã£o", error);
  }
}

/** Reads the persisted revision without resolving the complete playback plan. */
export async function effectiveRevisionFor(deviceId: string, organizationId: string | null) {
  try {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const rows = await getDb()
      .select({
        deviceRevision: schema.devices.playerRevision,
        organizationRevision: schema.organizations.playerRevision,
      })
      .from(schema.devices)
      .leftJoin(schema.organizations, eq(schema.organizations.id, schema.devices.organizationId))
      .where(eq(schema.devices.id, deviceId))
      .limit(1);
    const row = rows[0];
    return Math.max(
      revisionFor(deviceId, organizationId),
      Number(row?.deviceRevision ?? 0),
      Number(row?.organizationRevision ?? 0),
    );
  } catch {
    return revisionFor(deviceId, organizationId);
  }
}

/** Called whenever the waiting queue or the latest call of a panel changes. */
export function notifyQueuePanel(panelId: string) {
  const current = bus.queuePanelRevision.get(panelId) ?? 0;
  bus.queuePanelRevision.set(panelId, Math.max(Date.now(), current + 1));
  releaseWaiters(`queue:${panelId}`);
}

/** Current revision used by authenticated queue operator panels. */
export function queueRevisionFor(panelId: string): number {
  return bus.queuePanelRevision.get(panelId) ?? 0;
}

/**
 * Holds one cheap request per operator and resolves immediately when that
 * panel's queue changes. A timeout keeps proxies and stale connections healthy.
 */
export function waitForQueueChange(
  panelId: string,
  since: number,
  timeoutMs = LONG_POLL_TIMEOUT_MS,
): Promise<number> {
  const current = queueRevisionFor(panelId);
  if (current > since) return Promise.resolve(current);

  return new Promise<number>((resolve) => {
    const key = `queue:${panelId}`;
    let settled = false;
    const finish = (revision: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(waiter.timer);
      const set = bus.waiters.get(key);
      set?.delete(waiter);
      if (set?.size === 0) bus.waiters.delete(key);
      resolve(revision);
    };
    const waiter: Waiter = {
      since,
      resolve: finish,
      timer: setTimeout(() => finish(queueRevisionFor(panelId)), timeoutMs),
    };
    const set = bus.waiters.get(key) ?? new Set<Waiter>();
    set.add(waiter);
    bus.waiters.set(key, set);
  });
}

/**
 * Resolves as soon as something changes for this screen, or after the timeout
 * with the unchanged revision.
 */
export function waitForChange(
  deviceId: string,
  organizationId: string | null,
  since: number,
  timeoutMs = LONG_POLL_TIMEOUT_MS,
): Promise<number> {
  const current = revisionFor(deviceId, organizationId);
  if (current > since) return Promise.resolve(current);

  const keys = [`device:${deviceId}`];
  if (organizationId) keys.push(`org:${organizationId}`);

  return new Promise<number>((resolve) => {
    let settled = false;
    const waiters: Array<{ key: string; waiter: Waiter }> = [];

    const finish = (revision: number) => {
      if (settled) return;
      settled = true;
      for (const { key, waiter } of waiters) {
        clearTimeout(waiter.timer);
        bus.waiters.get(key)?.delete(waiter);
      }
      resolve(revision);
    };

    for (const key of keys) {
      const waiter: Waiter = {
        since,
        resolve: finish,
        timer: setTimeout(() => finish(revisionFor(deviceId, organizationId)), timeoutMs),
      };
      waiters.push({ key, waiter });
      const set = bus.waiters.get(key) ?? new Set<Waiter>();
      set.add(waiter);
      bus.waiters.set(key, set);
    }
  });
}
