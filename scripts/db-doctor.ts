import { promises as dns } from "node:dns";
import { createConnection } from "node:net";
import { SQL } from "bun";

type EndpointKind =
  | "supabase-direct"
  | "supavisor-session"
  | "supavisor-transaction"
  | "local"
  | "other";

interface SqlProbeResult {
  ok: boolean;
  code?: string;
}

function endpointKind(url: URL): EndpointKind {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    return "local";
  }
  if (url.hostname.startsWith("db.") && url.hostname.endsWith(".supabase.co")) {
    return "supabase-direct";
  }
  if (url.hostname.endsWith(".pooler.supabase.com")) {
    return (url.port || "5432") === "6543" ? "supavisor-transaction" : "supavisor-session";
  }
  return "other";
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}

async function tcpProbe(hostname: string, port: number): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: hostname, port });
    let settled = false;
    const finish = (result: { ok: boolean; code?: string }): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(5_000);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, code: "TCP_TIMEOUT" }));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      finish({ ok: false, ...(error.code ? { code: error.code } : {}) }),
    );
  });
}

async function sqlProbe(connectionUrl: string): Promise<SqlProbeResult> {
  const sql = new SQL(connectionUrl, { max: 1, connectionTimeout: 5, idleTimeout: 5 });
  try {
    await sql`select 1 as healthy`;
    return { ok: true };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  } finally {
    await sql.close({ timeout: 1 }).catch(() => undefined);
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL 尚未設定");

let url: URL;
try {
  url = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL 格式無效；若密碼含特殊字元，請先做 percent-encoding");
}
if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
  throw new Error("DATABASE_URL 必須使用 postgres:// 或 postgresql://");
}

const kind = endpointKind(url);
const port = Number(url.port || "5432");
let ipv4Records = 0;
let ipv6Records = 0;
let dnsError: string | undefined;
try {
  const records = await dns.lookup(url.hostname, { all: true });
  ipv4Records = records.filter((record) => record.family === 4).length;
  ipv6Records = records.filter((record) => record.family === 6).length;
} catch (error) {
  dnsError = errorCode(error);
}

const tcp = dnsError ? { ok: false, code: "DNS_FAILED" } : await tcpProbe(url.hostname, port);
const configuredSslMode = url.searchParams.get("sslmode");
const current = tcp.ok ? await sqlProbe(databaseUrl) : { ok: false, code: "TCP_UNREACHABLE" };
let requireSsl: SqlProbeResult | null = null;
if (tcp.ok && !current.ok && configuredSslMode !== "require") {
  const requireSslUrl = new URL(databaseUrl);
  requireSslUrl.searchParams.set("sslmode", "require");
  requireSsl = await sqlProbe(requireSslUrl.toString());
}

console.log(
  JSON.stringify(
    {
      endpoint: {
        kind,
        port,
        databaseNameConfigured: url.pathname.length > 1,
        usernameConfigured: url.username.length > 0,
        passwordConfigured: url.password.length > 0,
        sslMode: configuredSslMode ?? "prefer (Bun default)",
      },
      dns: { ipv4Records, ipv6Records, ...(dnsError ? { error: dnsError } : {}) },
      tcp,
      sql: { current, ...(requireSsl ? { requireSsl } : {}) },
    },
    null,
    2,
  ),
);

if (current.ok || requireSsl?.ok) {
  console.log(
    requireSsl?.ok
      ? "診斷：連線成功；請在 DATABASE_URL 加上 ?sslmode=require。"
      : "診斷：資料庫連線成功。",
  );
  process.exit(0);
}
if (kind === "supabase-direct" && ipv4Records === 0 && ipv6Records > 0 && !tcp.ok) {
  console.error(
    "診斷：direct endpoint 只有 IPv6，而目前網路無法連線。請改用 Supavisor session mode（port 5432）。",
  );
} else if (tcp.ok && kind.startsWith("supavisor")) {
  console.error(
    "診斷：已連到 Supavisor，但 PostgreSQL 驗證階段被關閉。請重新複製完整連線字串並檢查 project ref、帳號、資料庫密碼與 percent-encoding。 ",
  );
} else if (!tcp.ok) {
  console.error(
    "診斷：TCP 連線失敗。請檢查 endpoint、port、DNS、防火牆及 Supabase 專案是否暫停。 ",
  );
} else {
  console.error("診斷：TCP 可達，但 PostgreSQL 連線失敗。請檢查資料庫憑證、TLS 與專案狀態。 ");
}
process.exit(1);
