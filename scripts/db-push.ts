import { buildDbPushCommand } from "./db-push-config.ts";
import { createScriptLogger } from "./logger.ts";

const logger = createScriptLogger("DB");

const bun = Bun.which("bun");
if (!bun) throw new Error("Bun executable was not found");

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();
const projectRefFile = Bun.file("supabase/.temp/project-ref");
const linked = (await projectRefFile.exists()) && (await projectRefFile.text()).trim().length > 0;
const unsupportedArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
if (unsupportedArguments.length > 0) {
  throw new Error(`不支援的 db:push 參數：${unsupportedArguments.join(", ")}`);
}

let command: string[];
try {
  command = buildDbPushCommand({
    bunExecutable: bun,
    ...(migrationDatabaseUrl ? { migrationDatabaseUrl } : {}),
    linked,
    dryRun: process.argv.includes("--dry-run"),
  });
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const processHandle = Bun.spawn(command, {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
const exitCode = await processHandle.exited;
if (exitCode !== 0) process.exit(exitCode);
