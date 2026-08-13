import { SQL } from "bun";
import { createScriptLogger } from "./logger.ts";

const logger = createScriptLogger("DB");

const glob = new Bun.Glob("*.sql");
const migrationPaths = [...glob.scanSync({ cwd: "supabase/migrations", absolute: true })].sort();
if (migrationPaths.length === 0) throw new Error("No Supabase migration was found");
const source = (await Promise.all(migrationPaths.map((path) => Bun.file(path).text())))
  .join("\n")
  .toLowerCase();
const requiredStatements = [
  "create schema if not exists yakyulife",
  "enable row level security",
  "force row level security",
  "create role yakyulife_runtime",
  "discord_interaction_id text not null unique",
  "create table if not exists yakyulife.career_journal",
  "references yakyulife.careers (id) on delete cascade",
  "create extension if not exists pg_cron",
];
for (const statement of requiredStatements) {
  if (!source.includes(statement)) throw new Error(`Migration invariant missing: ${statement}`);
}
if (!source.includes("revoke all on schema yakyulife from public, anon, authenticated")) {
  throw new Error("Private schema grants were not revoked");
}

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (databaseUrl) {
  const sql = new SQL(databaseUrl, { max: 1 });
  const rows = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'yakyulife' order by table_name
  `;
  const names = rows.map((row) => row.table_name);
  if (
    !names.includes("careers") ||
    !names.includes("career_actions") ||
    !names.includes("career_journal")
  ) {
    throw new Error(
      "Connected database does not have the expected tables; run bun run db:push first",
    );
  }
  await sql.close();
  logger.success("Migration files and connected database verified.");
} else {
  logger.success("Migration files verified. Set TEST_DATABASE_URL for live schema verification.");
}
