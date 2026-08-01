import { and, eq, gte, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { buildLabel } from "@/lib/queue/queue-auth.server";

export type TicketKind = "normal" | "priority";

export type IssuedTicket = {
  id: string;
  label: string;
  kind: TicketKind;
  sectorId: string | null;
  sectorName: string | null;
  number: number;
  waitingAhead: number;
};

type PanelForIssue = {
  id: string;
  mode: string;
  prefix: string | null;
  numberingScope: string;
  priorityPrefix: string | null;
};

/**
 * Emite uma senha (recepção/totem) e devolve o rótulo já pronto.
 *
 * A numeração respeita a configuração do cliente: com "por setor" cada setor
 * tem a sua própria sequência; com "global" existe uma única sequência para
 * todos os setores (número puro, com o nome do setor exibido ao lado).
 */
export async function issueTicket(
  panel: PanelForIssue,
  input: { sectorId?: string | null; kind: TicketKind },
): Promise<IssuedTicket> {
  const db = getDb();
  const kind = input.kind;
  const perSector = panel.mode === "sector" && panel.numberingScope !== "global";

  let sectorId: string | null = null;
  let sectorName: string | null = null;
  let number: number;
  let prefix: string | null;

  if (panel.mode === "sector") {
    if (!input.sectorId) throw new Error("Escolha um setor.");
    const sector = (
      await db
        .select()
        .from(schema.queueSectors)
        .where(
          and(
            eq(schema.queueSectors.id, input.sectorId),
            eq(schema.queueSectors.panelId, panel.id),
          ),
        )
        .limit(1)
    )[0];
    if (!sector) throw new Error("Setor não encontrado.");
    sectorId = sector.id;
    sectorName = sector.name;

    // Limite diário opcional definido pelo cliente para esta fila.
    if (sector.dailyLimit !== null && sector.dailyLimit !== undefined) {
      const issuedToday = await countIssuedToday(sector.id);
      if (issuedToday >= sector.dailyLimit) {
        throw new Error(`As senhas de ${sector.name} já foram esgotadas hoje.`);
      }
    }

    if (perSector) {
      // Duas sequências paralelas: normal (001...) e preferencial (P001...).
      const updated =
        kind === "priority"
          ? await db
              .update(schema.queueSectors)
              .set({ lastPriorityNumber: sql`${schema.queueSectors.lastPriorityNumber} + 1` })
              .where(eq(schema.queueSectors.id, sector.id))
              .returning({ n: schema.queueSectors.lastPriorityNumber })
          : await db
              .update(schema.queueSectors)
              .set({ lastNumber: sql`${schema.queueSectors.lastNumber} + 1` })
              .where(eq(schema.queueSectors.id, sector.id))
              .returning({ n: schema.queueSectors.lastNumber });
      number = updated[0]?.n ?? 1;
      prefix =
        kind === "priority" ? (panel.priorityPrefix ?? "P") + (sector.prefix ?? "") : sector.prefix;
    } else {
      number = await bumpPanelCounter(panel.id, kind);
      // Numeração global: número puro (o setor aparece ao lado na TV).
      prefix = kind === "priority" ? (panel.priorityPrefix ?? "P") : null;
    }
  } else {
    number = await bumpPanelCounter(panel.id, kind);
    prefix =
      kind === "priority"
        ? (panel.priorityPrefix ?? "P") + (panel.prefix ?? "")
        : panel.prefix;
  }

  const label = buildLabel(prefix, number);

  const inserted = await db
    .insert(schema.queueTickets)
    .values({ panelId: panel.id, sectorId, sectorName, kind, number, label })
    .returning({ id: schema.queueTickets.id });

  const ahead = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.queueTickets)
    .where(
      and(eq(schema.queueTickets.panelId, panel.id), eq(schema.queueTickets.status, "waiting")),
    );

  return {
    id: inserted[0]?.id ?? "",
    label,
    kind,
    sectorId,
    sectorName,
    number,
    waitingAhead: Math.max(0, Number(ahead[0]?.total ?? 1) - 1),
  };
}

async function bumpPanelCounter(panelId: string, kind: TicketKind) {
  const db = getDb();
  const updated =
    kind === "priority"
      ? await db
          .update(schema.queuePanels)
          .set({ lastPriorityNumber: sql`${schema.queuePanels.lastPriorityNumber} + 1` })
          .where(eq(schema.queuePanels.id, panelId))
          .returning({ n: schema.queuePanels.lastPriorityNumber })
      : await db
          .update(schema.queuePanels)
          .set({ lastNumber: sql`${schema.queuePanels.lastNumber} + 1` })
          .where(eq(schema.queuePanels.id, panelId))
          .returning({ n: schema.queuePanels.lastNumber });
  return updated[0]?.n ?? 1;
}

/** Senhas emitidas hoje nesta fila (canceladas não contam). */
async function countIssuedToday(sectorId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.queueTickets)
    .where(
      and(
        eq(schema.queueTickets.sectorId, sectorId),
        ne(schema.queueTickets.status, "cancelled"),
        gte(schema.queueTickets.issuedAt, start),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Próxima senha da fila conforme a política do cliente:
 * "priority" = preferenciais sempre primeiro · "alternate" = uma preferencial,
 * uma normal, alternadamente.
 */
export function pickNextKind(policy: string, lastCalledKind: string, has: {
  normal: boolean;
  priority: boolean;
}): TicketKind | null {
  if (!has.normal && !has.priority) return null;
  if (policy === "alternate") {
    const first: TicketKind = lastCalledKind === "priority" ? "normal" : "priority";
    if (has[first]) return first;
    return first === "priority" ? "normal" : "priority";
  }
  return has.priority ? "priority" : "normal";
}
