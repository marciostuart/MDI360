import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let pool: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** True when the app has a database connection string available. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Lazily builds the connection pool. Must only be called from inside a server
 * handler — env vars are injected at request time, not at module load.
 */
export function getDb(): NodePgDatabase<typeof schema> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseNotConfiguredError();

  if (!dbInstance) {
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== "false" }
          : undefined,
    });
    dbInstance = drizzle(pool, { schema });
  }

  return dbInstance;
}

export { schema };