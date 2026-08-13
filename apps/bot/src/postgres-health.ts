const TRANSIENT_POSTGRES_CODES = new Set([
  "ERR_POSTGRES_CONNECTION_CLOSED",
  "ERR_POSTGRES_CONNECTION_TIMEOUT",
  "ERR_POSTGRES_IDLE_TIMEOUT",
]);

interface PostgresErrorLike {
  code?: unknown;
}

export interface PostgresStartupRetryOptions {
  attempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
  onRetry?: (details: { attempt: number; delayMilliseconds: number; code: string }) => void;
}

export function postgresErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as PostgresErrorLike).code;
  return typeof code === "string" ? code : null;
}

export function isTransientPostgresError(error: unknown): boolean {
  const code = postgresErrorCode(error);
  return code !== null && TRANSIENT_POSTGRES_CODES.has(code);
}

export async function verifyPostgresConnection(
  query: () => Promise<unknown>,
  options: PostgresStartupRetryOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? 4;
  const delay =
    options.delay ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error("PostgreSQL startup retry attempts must be a positive integer");

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await query();
      return;
    } catch (error) {
      if (!isTransientPostgresError(error) || attempt === attempts) throw error;
      const delayMilliseconds = 250 * 2 ** (attempt - 1);
      options.onRetry?.({
        attempt,
        delayMilliseconds,
        code: postgresErrorCode(error) ?? "UNKNOWN",
      });
      await delay(delayMilliseconds);
    }
  }
}
