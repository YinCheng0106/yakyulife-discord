export interface DbPushCommandInput {
  bunExecutable: string;
  migrationDatabaseUrl?: string;
  linked: boolean;
  dryRun: boolean;
}

export const NO_DATABASE_TARGET_MESSAGE = `找不到 Supabase migration 目標。

請選擇其中一種方式：
1. 建議：先執行 bunx supabase login，再執行 bunx supabase link --project-ref <PROJECT_REF>
2. 或在 .env 設定 MIGRATION_DATABASE_URL（管理用 PostgreSQL URL，必須具備 DDL 權限）

DATABASE_URL 是 Bot runtime 專用的低權限連線，不會被 db:push 當成 migration 連線。`;

function validateDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL 不是有效的 URL");
  }
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname) {
    throw new Error("MIGRATION_DATABASE_URL 必須是 PostgreSQL URL");
  }
}

export function buildDbPushCommand(input: DbPushCommandInput): string[] {
  const command = [input.bunExecutable, "x", "supabase", "db", "push", "--include-all"];
  if (input.dryRun) command.push("--dry-run");
  if (input.migrationDatabaseUrl) {
    validateDatabaseUrl(input.migrationDatabaseUrl);
    command.push("--db-url", input.migrationDatabaseUrl);
    return command;
  }
  if (input.linked) {
    command.push("--linked");
    return command;
  }
  throw new Error(NO_DATABASE_TARGET_MESSAGE);
}
