import { CareerService, cryptoIdGenerator, systemClock } from "@yakyulife/core";
import { createCareerFeature, sharpShareCardRenderer } from "@yakyulife/discord";
import { PostgresCareerRepository } from "@yakyulife/postgres";
import { SQL } from "bun";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";

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
const feature = createCareerFeature({
  careerService,
  logger,
  shareCardRenderer: sharpShareCardRenderer,
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

await sql`select 1 as healthy`;
await client.login(config.discordToken);

const server = Bun.serve({
  port: config.port,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json(
        {
          ok: client.isReady(),
          service: "yakyulife-discord",
          version: "0.3.0",
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
  logger.info("Shutting down", { signal });
  await server.stop(false);
  client.destroy();
  await sql.close({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
