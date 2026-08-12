import type { Logger } from "@yakyulife/core";
import signale from "signale";

const priorities = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof priorities;

export function createLogger(minimumLevel: Level): Logger {
  const logger = new signale.Signale({ scope: "BOT" });

  function write(
    level: Level,
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (priorities[level] < priorities[minimumLevel]) return;
    const details = {
      ...context,
      ...(error === undefined ? {} : { error }),
    };
    const hasDetails = Object.keys(details).length > 0;
    logger[level](message, ...(hasDetails ? [details] : []));
  }
  return {
    debug: (message, context) => write("debug", message, undefined, context),
    info: (message, context) => write("info", message, undefined, context),
    warn: (message, context) => write("warn", message, undefined, context),
    error: (message, error, context) => write("error", message, error, context),
  };
}
