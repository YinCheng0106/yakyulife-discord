import { describe, expect, test } from "bun:test";
import { buildDbPushCommand, NO_DATABASE_TARGET_MESSAGE } from "../../scripts/db-push-config.ts";

describe("db:push target selection", () => {
  test("uses an explicitly linked Supabase project", () => {
    expect(
      buildDbPushCommand({
        bunExecutable: "/bun",
        linked: true,
        dryRun: false,
      }),
    ).toEqual(["/bun", "x", "supabase", "db", "push", "--include-all", "--linked"]);
  });

  test("prefers the migration admin URL and supports dry-run", () => {
    const migrationDatabaseUrl = "postgresql://migration:secret@example.supabase.co:5432/postgres";
    expect(
      buildDbPushCommand({
        bunExecutable: "/bun",
        migrationDatabaseUrl,
        linked: true,
        dryRun: true,
      }),
    ).toEqual([
      "/bun",
      "x",
      "supabase",
      "db",
      "push",
      "--include-all",
      "--dry-run",
      "--db-url",
      migrationDatabaseUrl,
    ]);
  });

  test("fails before invoking the CLI when no target is configured", () => {
    expect(() =>
      buildDbPushCommand({ bunExecutable: "/bun", linked: false, dryRun: false }),
    ).toThrow(NO_DATABASE_TARGET_MESSAGE);
  });

  test("rejects a non-PostgreSQL migration URL", () => {
    expect(() =>
      buildDbPushCommand({
        bunExecutable: "/bun",
        migrationDatabaseUrl: "https://example.com",
        linked: false,
        dryRun: false,
      }),
    ).toThrow("必須是 PostgreSQL URL");
  });
});
