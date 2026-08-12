import { DomainError } from "@yakyulife/core";

export interface BotConfig {
  discordToken: string;
  discordApplicationId: string;
  databaseUrl: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DomainError(`缺少必要環境變數：${name}`);
  return value;
}

export function loadConfig(): BotConfig {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new DomainError("PORT 必須是有效連接埠");
  const configuredLevel = process.env.LOG_LEVEL ?? "info";
  const levels = ["debug", "info", "warn", "error"] as const;
  if (!levels.includes(configuredLevel as (typeof levels)[number]))
    throw new DomainError("LOG_LEVEL 無效");
  return {
    discordToken: required("DISCORD_TOKEN"),
    discordApplicationId: required("DISCORD_APPLICATION_ID"),
    databaseUrl: required("DATABASE_URL"),
    port,
    logLevel: configuredLevel as BotConfig["logLevel"],
  };
}
