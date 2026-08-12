import { careerCommands } from "@yakyulife/discord";
import { REST, Routes } from "discord.js";
import { createScriptLogger } from "./logger.ts";

const logger = createScriptLogger("COMMANDS");

const token = process.env.DISCORD_TOKEN?.trim();
const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();
if (!token || !applicationId)
  throw new Error("DISCORD_TOKEN and DISCORD_APPLICATION_ID are required");

const rest = new REST({ version: "10" }).setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(applicationId, guildId)
  : Routes.applicationCommands(applicationId);
await rest.put(route, { body: careerCommands });
logger.success(
  `Deployed ${careerCommands.length} command definition(s) to ${guildId ? `guild ${guildId}` : "global"}.`,
);
