import "server-only";

import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL, POSTGRES_URL, or DATABASE_URL_UNPOOLED.");
}

export const sql = neon(connectionString);

export function typedSql<T>(
  strings: TemplateStringsArray,
  ...params: any[]
): Promise<T[]> {
  return sql(strings, ...params) as Promise<T[]>;
}
