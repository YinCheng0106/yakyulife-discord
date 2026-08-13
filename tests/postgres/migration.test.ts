import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260812155542_add_career_journal_and_retention.sql",
  import.meta.url,
);

describe("career journal migration", () => {
  test("keeps journal private, transactional, and cascade-owned by a career", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("create table if not exists yakyulife.career_journal");
    expect(sql).toContain("references yakyulife.careers (id) on delete cascade");
    expect(sql).toContain("force row level security");
    expect(sql).toContain(
      "revoke all on yakyulife.career_journal from public, anon, authenticated",
    );
  });

  test("deletes only abandoned careers older than thirty days in bounded batches", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("status = 'abandoned'");
    expect(sql).toContain("updated_at < now() - interval '30 days'");
    expect(sql).toContain("limit 500");
    expect(sql).toContain("yakyulife-delete-abandoned-careers");
  });
});

describe("salary duel migration", () => {
  const duelMigration = new URL(
    "../../supabase/migrations/20260813023421_add_salary_duels.sql",
    import.meta.url,
  );

  test("keeps challenge seeds and participants in the private runtime schema", async () => {
    const sql = await Bun.file(duelMigration).text();
    expect(sql).toContain("create table yakyulife.salary_duels");
    expect(sql).toContain("create table yakyulife.salary_duel_players");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on yakyulife.salary_duels from public, anon, authenticated");
    expect(sql).toContain("references yakyulife.careers (id) on delete set null");
  });

  test("expires live games and purges bounded 30/90 day batches", async () => {
    const sql = await Bun.file(duelMigration).text();
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("interval '90 days'");
    expect(sql).toContain("limit 500");
    expect(sql).toContain("create or replace function yakyulife.maintain_salary_duels");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("yakyulife-expire-and-purge-salary-duels");
  });
});
