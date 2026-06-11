import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL, POSTGRES_URL, or DATABASE_URL_UNPOOLED.');
  process.exit(1);
}

const migrationDir = path.join(process.cwd(), 'db', 'migrations');
const migrationFiles = readdirSync(migrationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

for (const file of migrationFiles) {
  const sqlPath = path.join(migrationDir, file);
  const result = spawnSync('psql', [databaseUrl, '-f', sqlPath], { stdio: 'inherit' });

  if (result.error) {
    console.error('Could not run psql. Install PostgreSQL client tools or run the SQL file in Neon.');
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

process.exit(0);
