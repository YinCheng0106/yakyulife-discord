import type { AbilityKey, CareerState, EventStrategy, PitchEffort } from "./types.ts";

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  stamina: "體力",
  velocity: "球速",
  control: "控球",
  breaking: "變化球",
};

export const LEVEL_LABELS = {
  amateur: "業餘",
  cpbl2: "中職二軍",
  cpbl1: "中職一軍",
} as const;

export const ROLE_LABELS = {
  starter: "先發",
  reliever: "中繼",
  closer: "終結者",
} as const;

export const TRAIT_LABELS = {
  genius: "天才",
  fragile: "玻璃人",
  iron_man: "鐵人",
  late_bloomer: "大器晚成",
  disciplined: "自律狂",
  clutch: "大心臟",
  rubber_arm: "橡膠手臂",
} as const;

export interface CareerEventRule {
  id: string;
  title: string;
  description: string;
  ability: AbilityKey;
  injuryRisk?: number;
}

export const CAREER_EVENTS: readonly CareerEventRule[] = [
  {
    id: "bullpen_session",
    title: "牛棚加練",
    description: "投手教練提議調整握法，可能得到更銳利的變化球。",
    ability: "breaking",
  },
  {
    id: "video_room",
    title: "影像分析課",
    description: "情蒐小組找出對手弱點，但過多資訊也可能讓動作僵化。",
    ability: "control",
  },
  {
    id: "velocity_day",
    title: "球速測定日",
    description: "雷達槍已架好；全力催球可能突破，也可能讓手肘發炎。",
    ability: "velocity",
    injuryRisk: 8,
  },
  {
    id: "conditioning",
    title: "體能強化週期",
    description: "完整重量與恢復課表，有機會讓整季續航脫胎換骨。",
    ability: "stamina",
    injuryRisk: 3,
  },
] as const;

export const STRATEGY_CONFIG: Record<
  EventStrategy,
  { successChance: number; magnitude: number; label: string }
> = {
  safe: { successChance: 70, magnitude: 1, label: "保守應對" },
  normal: { successChance: 50, magnitude: 2, label: "照常執行" },
  bold: { successChance: 35, magnitude: 3, label: "全力一搏" },
};

export const EFFORT_CONFIG: Record<
  PitchEffort,
  { performance: number; tjMultiplier: number; label: string }
> = {
  full: { performance: 1, tjMultiplier: 1.25, label: "全力投" },
  normal: { performance: 0, tjMultiplier: 1, label: "普通投" },
  easy: { performance: -1, tjMultiplier: 0.65, label: "養生球" },
};

export const LEAGUE_THRESHOLDS = {
  cpbl1PromotionOverall: 41,
  cpbl2DemotionOverall: 39,
  forcedRetirementAge: 48,
} as const;

export const TRAIT_THRESHOLDS = {
  geniusSixesBefore22: 5,
  fragileMajorInjuries: 2,
  ironManHealthySeasons: 5,
  lateBloomerMinimumAge: 25,
  lateBloomerMaximumOverall: 46,
  lateBloomerChance: 18,
  disciplinedChoices: 3,
  clutchBoldSuccesses: 3,
  rubberArmInjections: 2,
} as const;

export function overall(state: CareerState): number {
  const { stamina, velocity, control, breaking } = state.abilities;
  return Math.round(stamina * 0.2 + velocity * 0.3 + control * 0.25 + breaking * 0.25);
}

export function abilityCost(state: CareerState, key: AbilityKey): number {
  const current = state.abilities[key];
  const base = current < 60 ? 1 : current < 70 ? 2 : current < 75 ? 3 : 4;
  return current >= state.potential[key] ? base * 4 : base;
}
