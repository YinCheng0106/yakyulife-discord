import type {
  AbilityKey,
  CareerState,
  DefensivePosition,
  EventStrategy,
  LeagueKey,
  LeagueLevel,
  PitchEffort,
  PositionGroup,
} from "./types.ts";

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  stamina: "體力",
  velocity: "球速",
  control: "控球",
  breaking: "變化球",
  contact: "擊球",
  power: "力量",
  speed: "速度",
  eye: "選球",
  range: "守備範圍",
  fielding: "守備",
  arm: "臂力",
  calling: "配球",
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

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  pitcher: "投手",
  catcher: "捕手",
  infielder: "內野手",
  outfielder: "外野手",
};

export const POSITION_SALARY_MULTIPLIER: Record<DefensivePosition, number> = {
  P: 1,
  SS: 1.15,
  CF: 1.15,
  C: 1.12,
  "2B": 1.05,
  "3B": 1.05,
  RF: 1.05,
  "1B": 1,
  LF: 1,
  DH: 0.92,
};

export const POSITION_CANDIDATES: Record<PositionGroup, readonly DefensivePosition[]> = {
  pitcher: ["P"],
  catcher: ["C", "1B", "DH"],
  infielder: ["SS", "2B", "3B", "1B", "DH"],
  outfielder: ["CF", "RF", "LF", "1B", "DH"],
};

const POSITION_OFFSETS: Partial<Record<DefensivePosition, number>> = {
  SS: 5,
  CF: 4,
  C: 1,
  "2B": 0,
  "3B": -2,
  RF: -3,
  LF: -5,
  "1B": -10,
};

const ORIGINAL_POSITION_THRESHOLDS: Partial<
  Record<"cpbl1" | "npb1" | "mlb", Partial<Record<DefensivePosition, number>>>
> = {
  cpbl1: { C: 46, SS: 50, CF: 49, "2B": 46, "3B": 44, RF: 43, LF: 41, "1B": 36 },
  npb1: { C: 54, SS: 58, CF: 57, "2B": 53, "3B": 51, RF: 50, LF: 47, "1B": 42 },
  mlb: { C: 60, SS: 64, CF: 63, "2B": 59, "3B": 57, RF: 56, LF: 53, "1B": 48 },
};

export function positionThreshold(
  level: LeagueLevel,
  position: DefensivePosition,
  age: number,
): number {
  if (position === "DH" || position === "P") return 0;
  const original =
    level === "cpbl1" || level === "npb1" || level === "mlb"
      ? ORIGINAL_POSITION_THRESHOLDS[level]?.[position]
      : undefined;
  const base = original ?? LEAGUE_RULES[level].par + (POSITION_OFFSETS[position] ?? 0);
  return base - (age < 24 ? 3 : age < 26 ? 1.5 : 0);
}

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
  abilityByPosition?: Partial<Record<PositionGroup, AbilityKey>>;
  injuryRisk?: number;
  eligiblePositions?: readonly PositionGroup[];
  sourceNote?: string;
  choiceLabels?: readonly [string, string, string?];
}

export const CAREER_EVENTS: readonly CareerEventRule[] = [
  {
    id: "batting_machine",
    title: "打擊機特訓",
    description: "密集打擊練習可能校準擊球點，也可能讓姿勢走樣。",
    ability: "contact",
    eligiblePositions: ["catcher", "infielder", "outfielder"],
  },
  {
    id: "weight_cycle",
    title: "重量訓練週期",
    description: "挑戰重量訓練週期，成果與過度負荷只差一線。",
    ability: "stamina",
    injuryRisk: 3,
  },
  {
    id: "bullpen_session",
    title: "牛棚加練",
    description: "投手教練提議調整握法，可能得到更銳利的變化球。",
    ability: "breaking",
    eligiblePositions: ["pitcher"],
  },
  {
    id: "long_toss",
    title: "長傳接訓練",
    description: "長傳訓練可能養成雷射肩，也可能造成肩部緊繃。",
    ability: "arm",
    injuryRisk: 4,
    eligiblePositions: ["catcher", "infielder", "outfielder"],
  },
  {
    id: "video_room",
    title: "影像分析課",
    description: "看穿對手習性可以提升判斷，資訊過量也可能綁手綁腳。",
    ability: "eye",
    abilityByPosition: { pitcher: "control", catcher: "calling" },
  },
  {
    id: "base_running",
    title: "跑壘特訓",
    description: "起跑判讀的密集練習，同時帶來拉傷風險。",
    ability: "speed",
    injuryRisk: 5,
    eligiblePositions: ["catcher", "infielder", "outfielder"],
  },
  {
    id: "thousand_grounders",
    title: "守備千球練習",
    description: "大量不規則彈跳球考驗接球穩定度與第一步。",
    ability: "fielding",
    eligiblePositions: ["catcher", "infielder", "outfielder"],
  },
  {
    id: "hit_by_pitch_scare",
    title: "觸身球驚魂",
    description: "突如其來的近身速球考驗反應，也可能造成傷勢。",
    ability: "speed",
    abilityByPosition: { pitcher: "stamina" },
    injuryRisk: 12,
  },
  {
    id: "media_interview",
    title: "媒體專訪",
    description: "公開受訪可能累積人氣，也可能讓壓力影響狀態。",
    ability: "stamina",
  },
  {
    id: "coaching_attention",
    title: "教練團關注",
    description: "單獨指導可能突破瓶頸，也可能被迫修改不合適的動作。",
    ability: "stamina",
  },
  {
    id: "nutrition_sleep",
    title: "伙食與睡眠計畫",
    description: "新的飲食與睡眠規劃可能改善恢復，也可能因適應不良中斷。",
    ability: "stamina",
    injuryRisk: 4,
  },
  {
    id: "veteran_advice",
    title: "學長／老將指點",
    description: "前輩的一句話可能點醒你，也可能讓你繞上遠路。",
    ability: "stamina",
  },
  {
    id: "velocity_day",
    title: "球速測定日",
    description: "雷達槍已架好；全力催球可能突破，也可能讓手肘發炎。",
    ability: "velocity",
    injuryRisk: 10,
    eligiblePositions: ["pitcher"],
  },
  {
    id: "pitch_calling_study",
    title: "配球讀書會",
    description: "研究進壘點與配球邏輯，資訊也可能造成猶豫。",
    ability: "control",
    eligiblePositions: ["pitcher"],
  },
  {
    id: "late_night_food",
    title: "宵夜文化",
    description: "球隊聚餐帶來凝聚力，也考驗體態與第一步。",
    ability: "stamina",
  },
  {
    id: "endorsement_offer",
    title: "場外代言邀約",
    description: "商演能增加收入與曝光，過密行程也會壓縮訓練。",
    ability: "stamina",
  },
  {
    id: "midseason_slump",
    title: "季中低潮",
    description: "調整心態可能走出低潮，也可能讓低迷延續整月。",
    ability: "eye",
    abilityByPosition: { pitcher: "control" },
  },
  {
    id: "catcher_collision",
    title: "捕手本壘攻防",
    description: "偏傳迫使你在本壘前做出合法且即時的處理。",
    ability: "fielding",
    eligiblePositions: ["catcher"],
    sourceNote: "CPBL Official Baseball Rules 6.01(i)",
    choiceLabels: ["穩接再觸殺", "移位接偏傳、拚瞬間觸殺"],
  },
  {
    id: "double_play_turn",
    title: "二壘雙殺轉傳",
    description: "跑者滑向二壘，你必須在合法滑壘路徑旁完成轉傳。",
    ability: "fielding",
    eligiblePositions: ["infielder"],
    sourceNote: "Official Baseball Rule 6.01(j)",
    choiceLabels: ["踩壘避開跑者、穩傳一壘", "逆向快轉、拚完整雙殺"],
  },
  {
    id: "wall_catch",
    title: "全壘打牆前深遠飛球",
    description: "飛球一路往牆邊延伸，安全處理與美技只差一步。",
    ability: "range",
    injuryRisk: 12,
    eligiblePositions: ["outfielder"],
    sourceNote: "CPBL wall-catch injury reports",
    choiceLabels: ["卡位、單跳球處理", "全速追球、拚牆前接殺"],
  },
  {
    id: "rain_makeup",
    title: "雨延後的補賽週",
    description: "密集補賽壓縮恢復時間，球隊讓你決定本週負荷。",
    ability: "stamina",
    sourceNote: "CPBL postponement regulations",
    choiceLabels: ["接受輪休、保留體能", "爭取兩戰都先發"],
  },
  {
    id: "position_role_meeting",
    title: "守位定位會議",
    description: "教練團討論新球季的守位定位，請你在專精與多功能之間做選擇。",
    ability: "fielding",
    eligiblePositions: ["catcher", "infielder", "outfielder"],
    sourceNote: "Fictional position-development meeting",
    choiceLabels: ["爭取固定守位", "接受多守位調度"],
  },
  {
    id: "family_tournament_conflict",
    title: "國際賽與重要家庭日撞期",
    description: "國際賽徵召恰好撞上重要家庭日；兩條路都有真實代價。",
    ability: "stamina",
    sourceNote:
      "Inspired by a publicly documented WBSC Premier12 scheduling conflict; fictionalized",
    choiceLabels: ["🏠 家庭還是比較重要", "⚾ 棒球還是比較重要"],
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
  if ((state.positionGroup ?? "pitcher") === "pitcher") {
    const { stamina, velocity = 0, control = 0, breaking = 0 } = state.abilities;
    return Math.round(stamina * 0.2 + velocity * 0.3 + control * 0.25 + breaking * 0.25);
  }
  const { contact = 0, power = 0, eye = 0, speed = 0, stamina } = state.abilities;
  const offenseWeights = [0.38, 0.27, 0.2, 0.15] as const;
  const offense = [contact, power, eye, speed]
    .sort((left, right) => right - left)
    .reduce((sum, value, index) => sum + value * (offenseWeights[index] ?? 0), 0);
  const defense = defensiveScore(state, state.primaryPosition ?? "DH");
  const defenseWeight: Partial<Record<DefensivePosition, number>> = {
    SS: 0.3,
    CF: 0.3,
    C: 0.3,
    "2B": 0.22,
    "3B": 0.22,
    RF: 0.2,
    LF: 0.14,
    "1B": 0.12,
    DH: 0.12,
  };
  const weight = defenseWeight[state.primaryPosition ?? "DH"] ?? 0.24;
  return Math.round(offense * (1 - weight) + defense * weight + stamina * 0.05);
}

export function defensiveScore(state: CareerState, position: DefensivePosition): number {
  const { range = 0, fielding = 0, arm = 0, calling = 0 } = state.abilities;
  if (position === "C") return Math.round(fielding * 0.35 + arm * 0.25 + calling * 0.4);
  if (position === "DH") return Math.max(0, defensiveScore(state, "1B") - 12);
  if (position === "1B") return Math.round(fielding * 0.65 + range * 0.2 + arm * 0.15);
  return Math.round(range * 0.4 + fielding * 0.35 + arm * 0.25);
}

export function abilityCost(state: CareerState, key: AbilityKey): number {
  const current = state.abilities[key] ?? 0;
  const base = current < 60 ? 1 : current < 70 ? 2 : current < 75 ? 3 : 4;
  return current >= (state.potential[key] ?? 0) ? base * 4 : base;
}
