import type { Logger } from "@yakyulife/core";

const priorities = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof priorities;

export function createLogger(minimumLevel: Level): Logger {
  function write(
    level: Level,
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (priorities[level] < priorities[minimumLevel]) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...(error === undefined
        ? {}
        : {
            error:
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : String(error),
          }),
    };
    const output = JSON.stringify(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  }
  return {
    debug: (message, context) => write("debug", message, undefined, context),
    info: (message, context) => write("info", message, undefined, context),
    warn: (message, context) => write("warn", message, undefined, context),
    error: (message, error, context) => write("error", message, error, context),
  };
}
