/**
 * Lightweight traffic accounting. Every player/API request adds a few numbers
 * to an in-memory bucket that is flushed to Postgres at most once every 20s,
 * so the dashboard has real load data without one write per request.
 */
import { sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/lib/db/index.server";

type Buffer = { requests: number; bytesIn: number; bytesOut: number; flushing: boolean; last: number };

const globalRef = globalThis as unknown as { __mdiTraffic?: Buffer };
const buffer: Buffer =
  globalRef.__mdiTraffic ??
  (globalRef.__mdiTraffic = { requests: 0, bytesIn: 0, bytesOut: 0, flushing: false, last: 0 });

const FLUSH_INTERVAL_MS = 20_000;

function currentBucket() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

async function flush() {
  if (buffer.flushing || buffer.requests === 0 || !isDatabaseConfigured()) return;
  const snapshot = { ...buffer };
  buffer.requests = 0;
  buffer.bytesIn = 0;
  buffer.bytesOut = 0;
  buffer.flushing = true;
  buffer.last = Date.now();
  try {
    await getDb().execute(sql`
      insert into traffic_hourly (bucket, requests, bytes_in, bytes_out)
      values (${currentBucket()}, ${snapshot.requests}, ${snapshot.bytesIn}, ${snapshot.bytesOut})
      on conflict (bucket) do update set
        requests = traffic_hourly.requests + excluded.requests,
        bytes_in = traffic_hourly.bytes_in + excluded.bytes_in,
        bytes_out = traffic_hourly.bytes_out + excluded.bytes_out
    `);
  } catch (error) {
    console.error("traffic flush failed", error);
  } finally {
    buffer.flushing = false;
  }
}

/** Never throws and never blocks the caller's response. */
export function recordTraffic(bytesIn = 0, bytesOut = 0) {
  buffer.requests += 1;
  buffer.bytesIn += bytesIn;
  buffer.bytesOut += bytesOut;
  if (Date.now() - buffer.last > FLUSH_INTERVAL_MS) void flush();
}
