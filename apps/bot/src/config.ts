import {
  CORE_ENGINE_VERSION,
  DomainError,
  ENGINE_VERSION,
  FOUR_POSITION_ENGINE_VERSION,
  LEGACY_ENGINE_VERSION,
  MULTI_LEAGUE_ENGINE_VERSION,
} from "@yakyulife/core";

export interface BotConfig {
  discordToken: string;
  discordApplicationId: string;
  databaseUrl: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  careerEngineVersion: string;
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
  const careerEngineVersion = process.env.CAREER_ENGINE_VERSION?.trim() || ENGINE_VERSION;
  if (
    ![
      LEGACY_ENGINE_VERSION,
      CORE_ENGINE_VERSION,
      MULTI_LEAGUE_ENGINE_VERSION,
      FOUR_POSITION_ENGINE_VERSION,
      ENGINE_VERSION,
    ].includes(careerEngineVersion)
  )
    throw new DomainError("CAREER_ENGINE_VERSION 無效");
  return {
    discordToken: required("DISCORD_TOKEN"),
    discordApplicationId: required("DISCORD_APPLICATION_ID"),
    databaseUrl: required("DATABASE_URL"),
    port,
    logLevel: configuredLevel as BotConfig["logLevel"],
    careerEngineVersion,
  };
}
