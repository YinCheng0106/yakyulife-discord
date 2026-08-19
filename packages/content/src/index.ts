import { z } from "zod";
import balanceSource from "../content/v0.5/balance.json" with { type: "json" };
import eventsSource from "../content/v0.5/events.json" with { type: "json" };
import leaguesSource from "../content/v0.5/leagues.json" with { type: "json" };
import teamsSource from "../content/v0.5/teams.json" with { type: "json" };
import traitsSource from "../content/v0.5/traits.json" with { type: "json" };

export const CONTENT_PACK_VERSION = "0.5.0" as const;

const ability = z.enum([
  "stamina",
  "velocity",
  "control",
  "breaking",
  "contact",
  "power",
  "speed",
  "eye",
  "range",
  "fielding",
  "arm",
  "calling",
]);
const position = z.enum(["pitcher", "catcher", "infielder", "outfielder"]);
const league = z.enum(["amateur", "cpbl", "npb", "mlb", "kbo", "abl", "international"]);
const level = z.enum([
  "amateur",
  "cpbl2",
  "cpbl1",
  "npb2",
  "npb1",
  "rookie",
  "a",
  "high_a",
  "aa",
  "aaa",
  "mlb",
  "kbo2",
  "kbo1",
  "abl",
  "international",
]);
const effect = z.enum(["ability_delta", "injury_risk", "season_modifier", "special_case"]);

const eventSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    ability,
    abilityByPosition: z
      .object({
        pitcher: ability.optional(),
        catcher: ability.optional(),
        infielder: ability.optional(),
        outfielder: ability.optional(),
      })
      .strict()
      .optional(),
    injuryRisk: z.number().int().min(0).max(80).optional(),
    eligiblePositions: z.array(position).min(1).optional(),
    sourceNote: z.string().max(500).optional(),
    choiceLabels: z.array(z.string().min(1).max(80)).min(2).max(3).optional(),
    effects: z.array(effect).min(1),
  })
  .strict();

const eventsSchema = z
  .object({ version: z.literal(CONTENT_PACK_VERSION), events: z.array(eventSchema).min(1) })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of value.events.entries()) {
      if (ids.has(entry.id))
        context.addIssue({
          code: "custom",
          path: ["events", index, "id"],
          message: "事件 ID 不可重複",
        });
      ids.add(entry.id);
    }
  });

const teamsSchema = z
  .object({
    version: z.literal(CONTENT_PACK_VERSION),
    leagues: z.record(league, z.array(z.string().min(2).max(40))),
    mlbDivisions: z.record(z.string(), z.array(z.string().min(2).max(40)).length(5)),
  })
  .strict()
  .superRefine((value, context) => {
    const mlbTeams = value.leagues.mlb;
    if (!mlbTeams || mlbTeams.length !== 30)
      context.addIssue({
        code: "custom",
        path: ["leagues", "mlb"],
        message: "MLB 必須正好有 30 隊",
      });
    const flattened = Object.values(value.mlbDivisions).flat();
    if (Object.keys(value.mlbDivisions).length !== 6 || new Set(flattened).size !== 30)
      context.addIssue({
        code: "custom",
        path: ["mlbDivisions"],
        message: "MLB 必須有六個各五隊且不重複的分區",
      });
    if (
      mlbTeams &&
      (flattened.length !== mlbTeams.length || flattened.some((team) => !mlbTeams.includes(team)))
    )
      context.addIssue({
        code: "custom",
        path: ["mlbDivisions"],
        message: "分區球隊必須與 MLB 球隊清單一致",
      });
    for (const [leagueKey, values] of Object.entries(value.leagues))
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: "custom",
          path: ["leagues", leagueKey],
          message: "同一聯盟不可有重複球隊",
        });
  });

const leaguesSchema = z
  .object({
    version: z.literal(CONTENT_PACK_VERSION),
    levels: z.record(
      level,
      z
        .object({
          league,
          games: z.number().int().positive().max(200),
          par: z.number().min(0).max(100),
          baseSalary: z.number().int().min(0),
          promotionOverall: z.number().min(0).max(100).nullable(),
          demotionOverall: z.number().min(0).max(100).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

const balanceSchema = z
  .object({
    version: z.literal(CONTENT_PACK_VERSION),
    strategy: z.record(
      z.enum(["safe", "normal", "bold"]),
      z
        .object({
          successChance: z.number().min(0).max(100),
          magnitude: z.number().int().positive(),
          label: z.string().min(1),
        })
        .strict(),
    ),
    effort: z.record(
      z.enum(["full", "normal", "easy"]),
      z
        .object({
          performance: z.number(),
          tjMultiplier: z.number().positive(),
          label: z.string().min(1),
        })
        .strict(),
    ),
    thresholds: z.record(z.string(), z.number().finite()),
  })
  .strict();

const traitsSchema = z
  .object({
    version: z.literal(CONTENT_PACK_VERSION),
    traits: z.record(z.string(), z.string().min(1)),
  })
  .strict();

export function parseContentEvents(value: unknown) {
  return eventsSchema.parse(value);
}

export function parseContentTeams(value: unknown) {
  return teamsSchema.parse(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export const contentPack = Object.freeze({
  version: CONTENT_PACK_VERSION,
  leagues: leaguesSchema.parse(leaguesSource).levels,
  teams: teamsSchema.parse(teamsSource),
  events: eventsSchema.parse(eventsSource).events,
  balance: balanceSchema.parse(balanceSource),
  traits: traitsSchema.parse(traitsSource).traits,
});

export const CONTENT_PACK_HASH = `fnv1a64:${fnv1a64(stableJson(contentPack))}`;
export type ContentPack = typeof contentPack;
export type ContentEvent = ContentPack["events"][number];
