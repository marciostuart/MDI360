import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[signage] DATABASE_URL is not configured.");
  process.exit(1);
}

const client = new Client({
  connectionString,
  application_name: "mdi360-migrator",
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== "false" }
      : undefined,
});

const advisoryLockKey = 360360;

try {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [advisoryLockKey]);
  console.log("[signage] migration lock acquired.");

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[signage] migrations applied.");
} catch (error) {
  const details = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("[signage] migration error:\n" + details);

  try {
    const blockers = await client.query(`
      select blocked.pid as blocked_pid,
             blocker.pid as blocker_pid,
             blocker.application_name,
             blocker.state,
             left(blocker.query, 180) as blocker_query
      from pg_stat_activity blocked
      cross join lateral unnest(pg_blocking_pids(blocked.pid)) blocker_pid
      join pg_stat_activity blocker on blocker.pid = blocker_pid
      where blocked.application_name = 'mdi360-migrator'
    `);
    if (blockers.rows.length > 0) {
      console.error("[signage] database sessions blocking the migration:");
      console.error(JSON.stringify(blockers.rows, null, 2));
    }
  } catch (diagnosticError) {
    const message = diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError);
    console.error("[signage] could not inspect blocking sessions: " + message);
  }

  process.exitCode = 1;
} finally {
  try {
    await client.query("select pg_advisory_unlock($1)", [advisoryLockKey]);
  } catch {
    // The connection may already be closed after a database failure.
  }
  await client.end().catch(() => undefined);
}