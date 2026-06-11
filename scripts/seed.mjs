import { spawnSync } from "node:child_process";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL, POSTGRES_URL, or DATABASE_URL_UNPOOLED.");
  process.exit(1);
}

const sqlPath = path.join(process.cwd(), "db", "seed.sql");
const result = spawnSync("psql", [databaseUrl, "-f", sqlPath], { stdio: "inherit" });

if (result.error) {
  console.error("Could not run psql. Install PostgreSQL client tools or run the seed file in Neon.");
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
