import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import * as schema from "./schema.js";

export { schema };
export type Schema = typeof schema;

/**
 * Minimal driver surface the migration runner needs. Both PGlite and
 * node-postgres can run a multi-statement SQL string and a row-returning query,
 * so migrations work identically against either.
 */
export interface SqlDriver {
  /** Execute one or more SQL statements (DDL migration files). */
  exec(sql: string): Promise<void>;
  /** Run a single query and return its rows. */
  query(sql: string): Promise<Array<Record<string, unknown>>>;
}

/** Create an in-process PGlite database (used by the fast unit test suite). */
export function createPgliteDatabase(): {
  db: PgliteDatabase<Schema>;
  client: PGlite;
  driver: SqlDriver;
} {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  const driver: SqlDriver = {
    exec: async (sql) => {
      await client.exec(sql);
    },
    query: async (sql) => {
      const result = await client.query(sql);
      return result.rows as Array<Record<string, unknown>>;
    },
  };
  return { db, client, driver };
}

/** Wrap a node-postgres pool as a Drizzle database + migration driver. */
export function createPoolDatabase(pool: pg.Pool): {
  db: NodePgDatabase<Schema>;
  driver: SqlDriver;
} {
  const db = drizzleNodePg(pool, { schema });
  const driver: SqlDriver = {
    exec: async (sql) => {
      // Simple-query protocol allows multiple statements in one call.
      await pool.query(sql);
    },
    query: async (sql) => {
      const result = await pool.query(sql);
      return result.rows as Array<Record<string, unknown>>;
    },
  };
  return { db, driver };
}
