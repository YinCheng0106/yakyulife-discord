import { expect, test } from "bun:test";
import { createCareerState } from "@yakyulife/core";
import { PostgresCareerRepository, parseCareerState } from "@yakyulife/postgres";
import { SQL } from "bun";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const liveTest = databaseUrl ? test : test.skip;

liveTest("Supabase/Postgres private schema is available", async () => {
  if (!databaseUrl) return;
  const sql = new SQL(databaseUrl, { max: 1 });
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'yakyulife' order by table_name
  `;
  expect(tables.map((row) => row.table_name)).toEqual(
    expect.arrayContaining(["career_actions", "careers"]),
  );
  const expectedState = createCareerState("JSONB 驗證", "live-jsonb");
  const jsonbRows = await sql<{ state: unknown }[]>`
    select ${JSON.stringify(expectedState)}::jsonb as state
  `;
  expect(parseCareerState(jsonbRows[0]?.state)).toEqual(expectedState);
  const repository = new PostgresCareerRepository(sql);
  expect(await repository.findActiveByUser("integration-smoke-no-such-user")).toBeNull();
  await sql.close();
});
