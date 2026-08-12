import { chmod } from "node:fs/promises";

const envPath = ".env";
const backupPath = ".env.before-session-pooler";
const poolerPath = "supabase/.temp/pooler-url";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL 尚未設定");
if (!(await Bun.file(poolerPath).exists())) {
  throw new Error(
    "找不到 linked pooler URL；請先執行 bunx supabase link --project-ref <PROJECT_REF>",
  );
}

let current: URL;
let pooler: URL;
try {
  current = new URL(databaseUrl);
  pooler = new URL((await Bun.file(poolerPath).text()).trim());
} catch {
  throw new Error("DATABASE_URL 或 linked pooler URL 格式無效");
}
if (!pooler.hostname.endsWith(".pooler.supabase.com") || (pooler.port || "5432") !== "5432") {
  throw new Error("linked endpoint 不是 Supavisor session mode（port 5432）");
}
if (!current.password) throw new Error("DATABASE_URL 沒有資料庫密碼");

pooler.password = current.password;
pooler.searchParams.set("sslmode", "require");
const envFile = Bun.file(envPath);
if (!(await envFile.exists())) throw new Error("找不到 .env");
const source = await envFile.text();
const linePattern = /^DATABASE_URL=.*$/m;
if (!linePattern.test(source)) throw new Error(".env 沒有 DATABASE_URL 欄位");
const updated = source.replace(linePattern, `DATABASE_URL=${pooler.toString()}`);

if (updated === source) {
  console.log("DATABASE_URL 已使用 linked Supavisor session endpoint，無需修改。");
  process.exit(0);
}
if (!(await Bun.file(backupPath).exists())) await Bun.write(backupPath, source);
await Bun.write(envPath, updated);
await Promise.all([chmod(envPath, 0o600), chmod(backupPath, 0o600)]);
console.log("已將 DATABASE_URL 切換到 linked Supavisor session mode（port 5432）。");
console.log(`原始設定已備份至 ${backupPath}；兩個檔案都已限制為目前使用者讀寫。`);
