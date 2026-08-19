import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import { careerCommands } from "./career.ts";

export interface RegisteredCommand {
  name: string;
  definitions: readonly RESTPostAPIApplicationCommandsJSONBody[];
}

/** Explicit registration keeps deployable commands reviewable and type-safe. */
export const commandRegistry: readonly RegisteredCommand[] = [
  { name: "career", definitions: careerCommands },
];

export const registeredCommandDefinitions = commandRegistry.flatMap(
  (command) => command.definitions,
);
