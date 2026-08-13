import {
  CareerService,
  cryptoIdGenerator,
  ENGINE_VERSION,
  SalaryDuelService,
  systemClock,
} from "@yakyulife/core";
import {
  createCareerFeature,
  deliverPendingSalaryDuelResults,
  sharpShareCardRenderer,
} from "@yakyulife/discord";
import { PostgresCareerRepository } from "@yakyulife/postgres";
import { SQL } from "bun";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { verifyPostgresConnection } from "./postgres-health.ts";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const sql = new SQL(config.databaseUrl, { max: 10, idleTimeout: 30, connectionTimeout: 10 });
const repository = new PostgresCareerRepository(sql);
const careerService = new CareerService(
  repository,
  systemClock,
  cryptoIdGenerator,
  config.careerEngineVersion,
);
const salaryDuelService = new SalaryDuelService(repository, systemClock, cryptoIdGenerator);
const feature = createCareerFeature({
  careerService,
  logger,
  shareCardRenderer: sharpShareCardRenderer,
  salaryDuelService,
});
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

client.on(Events.InteractionCreate, async (interaction) => {
  await feature.handleInteraction(interaction);
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info("Discord client ready", { user: readyClient.user.tag });
});
client.on(Events.Error, (error) => logger.error("Discord client error", error));
client.on(Events.Warn, (message) => logger.warn("Discord client warning", { message }));

await verifyPostgresConnection(() => sql`select 1 as healthy`, {
  onRetry: ({ attempt, delayMilliseconds, code }) =>
    logger.warn("Transient PostgreSQL startup failure; retrying", {
      attempt,
      delayMilliseconds,
      code,
    }),
});
await client.login(config.discordToken);

async function maintainSalaryDuels(): Promise<void> {
  try {
    await salaryDuelService.maintain();
    await deliverPendingSalaryDuelResults(
      client,
      salaryDuelService,
      sharpShareCardRenderer,
      logger,
    );
  } catch (error) {
    logger.error("Salary duel maintenance failed", error);
  }
}

await maintainSalaryDuels();
const salaryDuelMaintenance = setInterval(() => void maintainSalaryDuels(), 15 * 60 * 1000);

const server = Bun.serve({
  port: config.port,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json(
        {
          ok: client.isReady(),
          service: "yakyulife-discord",
          version: ENGINE_VERSION,
          careerEngine: config.careerEngineVersion,
        },
        {
          status: client.isReady() ? 200 : 503,
        },
      );
    }
    return new Response("Not Found", { status: 404 });
  },
});
logger.info("Health endpoint listening", { port: server.port });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(salaryDuelMaintenance);
  logger.info("Shutting down", { signal });
  await server.stop(false);
  client.destroy();
  await sql.close({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
