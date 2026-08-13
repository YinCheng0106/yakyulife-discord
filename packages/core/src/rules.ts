import type {
  AbilityKey,
  CareerState,
  EventStrategy,
  LeagueKey,
  LeagueLevel,
  PitchEffort,
} from "./types.ts";

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
  npb2: "日職二軍",
  npb1: "日職一軍",
  rookie: "美職新人聯盟",
  a: "小聯盟 1A",
  high_a: "高階 1A",
  aa: "小聯盟 2A",
  aaa: "小聯盟 3A",
  mlb: "大聯盟",
  kbo2: "韓職二軍",
  kbo1: "韓職一軍",
  abl: "澳洲職棒",
  international: "國際賽",
} as const;

export interface LeagueRule {
  league: LeagueKey;
  games: number;
  par: number;
  baseSalary: number;
  promotionOverall: number | null;
  demotionOverall: number | null;
}

export const LEAGUE_RULES: Record<LeagueLevel, LeagueRule> = {
  amateur: {
    league: "amateur",
    games: 30,
    par: 32,
    baseSalary: 0,
    promotionOverall: null,
    demotionOverall: null,
  },
  cpbl2: {
    league: "cpbl",
    games: 80,
    par: 34,
    baseSalary: 84,
    promotionOverall: 41,
    demotionOverall: null,
  },
  cpbl1: {
    league: "cpbl",
    games: 120,
    par: 44,
    baseSalary: 300,
    promotionOverall: null,
    demotionOverall: 39,
  },
  npb2: {
    league: "npb",
    games: 110,
    par: 45,
    baseSalary: 720,
    promotionOverall: 53,
    demotionOverall: null,
  },
  npb1: {
    league: "npb",
    games: 143,
    par: 54,
    baseSalary: 2_400,
    promotionOverall: null,
    demotionOverall: 49,
  },
  rookie: {
    league: "mlb",
    games: 60,
    par: 34,
    baseSalary: 180,
    promotionOverall: 38,
    demotionOverall: null,
  },
  a: {
    league: "mlb",
    games: 132,
    par: 39,
    baseSalary: 300,
    promotionOverall: 43,
    demotionOverall: 33,
  },
  high_a: {
    league: "mlb",
    games: 132,
    par: 44,
    baseSalary: 420,
    promotionOverall: 48,
    demotionOverall: 38,
  },
  aa: {
    league: "mlb",
    games: 138,
    par: 49,
    baseSalary: 600,
    promotionOverall: 54,
    demotionOverall: 43,
  },
  aaa: {
    league: "mlb",
    games: 150,
    par: 53,
    baseSalary: 1_200,
    promotionOverall: 61,
    demotionOverall: 48,
  },
  mlb: {
    league: "mlb",
    games: 162,
    par: 63,
    baseSalary: 24_000,
    promotionOverall: null,
    demotionOverall: 56,
  },
  kbo2: {
    league: "kbo",
    games: 118,
    par: 43,
    baseSalary: 600,
    promotionOverall: 50,
    demotionOverall: null,
  },
  kbo1: {
    league: "kbo",
    games: 144,
    par: 51,
    baseSalary: 1_800,
    promotionOverall: null,
    demotionOverall: 46,
  },
  abl: {
    league: "abl",
    games: 39,
    par: 40,
    baseSalary: 180,
    promotionOverall: null,
    demotionOverall: null,
  },
  international: {
    league: "international",
    games: 8,
    par: 54,
    baseSalary: 0,
    promotionOverall: null,
    demotionOverall: null,
  },
};

export const LEAGUE_TEAMS: Record<LeagueKey, readonly string[]> = {
  amateur: [],
  cpbl: ["台中猛瑪", "府城雄獅", "桃園金剛", "新北騎士", "台北恐龍", "高雄神鵰"],
  npb: ["東京白鷺", "大阪烈牛", "北海道雪狐", "福岡海星", "名古屋金鯱", "仙台青葉"],
  mlb: ["紐約自由鳥", "洛杉磯星艦", "西雅圖逆戟鯨", "芝加哥風暴", "德州長角", "波士頓茶船"],
  kbo: [
    "首爾彗星",
    "首爾守衛",
    "仁川海風",
    "水原白鹿",
    "大田火箭",
    "大邱火鳥",
    "光州閃電",
    "釜山鯨群",
    "昌原機械人",
    "清州山貓",
  ],
  abl: ["雪梨灣鯊", "布里斯本笑翠鳥", "阿德雷德袋鼠", "伯斯沙暴"],
  international: ["中華隊"],
};

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
