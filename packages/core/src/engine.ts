import { DomainError } from "./errors.ts";
import { chance, initialRngState, keyedRandom, pick, random, randomInt } from "./rng.ts";
import {
  ABILITY_LABELS,
  abilityCost,
  CAREER_EVENTS,
  type CareerEventRule,
  defensiveScore,
  EFFORT_CONFIG,
  LEAGUE_RULES,
  LEAGUE_TEAMS,
  LEAGUE_THRESHOLDS,
  LEVEL_LABELS,
  overall,
  POSITION_CANDIDATES,
  POSITION_SALARY_MULTIPLIER,
  positionThreshold,
  STRATEGY_CONFIG,
  TRAIT_THRESHOLDS,
} from "./rules.ts";
import {
  type AbilityKey,
  type AbilitySet,
  type CareerState,
  type CareerSummary,
  type DefensivePosition,
  ENGINE_VERSION,
  type EngineEvent,
  type EngineResult,
  type GameAction,
  LEGACY_ENGINE_VERSION,
  LEGACY_UPSTREAM_COMMIT,
  type LeagueLevel,
  MULTI_LEAGUE_ENGINE_VERSION,
  type PositionGroup,
  SALARY_DUEL_RULESET_VERSION,
  type ScoutingMarket,
  type ScoutingState,
  type ScoutingTier,
  type ScoutOffer,
  type SeasonStats,
  STATE_SCHEMA_VERSION,
  type TraitKey,
  UPSTREAM_COMMIT,
} from "./types.ts";

const PITCHER_ABILITY_KEYS: readonly AbilityKey[] = ["stamina", "velocity", "control", "breaking"];
const HITTER_ABILITY_KEYS: readonly AbilityKey[] = [
  "stamina",
  "contact",
  "power",
  "speed",
  "eye",
  "range",
  "fielding",
  "arm",
];
const LEGACY_CAREER_EVENTS: readonly CareerEventRule[] = [
  {
    id: "bullpen_session",
    title: "牛棚加練",
    description: "投手教練提議調整握法。",
    ability: "breaking",
  },
  {
    id: "video_room",
    title: "影像分析課",
    description: "情蒐小組找出對手弱點。",
    ability: "control",
  },
  {
    id: "velocity_day",
    title: "球速測定日",
    description: "雷達槍已架好。",
    ability: "velocity",
    injuryRisk: 8,
  },
  {
    id: "conditioning",
    title: "體能強化週期",
    description: "完整重量與恢復課表。",
    ability: "stamina",
    injuryRisk: 3,
  },
];
const HIGH_SCHOOLS = ["平鎮高中", "穀保家商", "高苑工商", "北科附工", "普門高中", "東大體中"];
const UNIVERSITIES = ["北方大學", "府城大學", "海線體育大學", "首都科技大學"];
const AMATEUR_CLUBS = ["港灣成棒隊", "山城成棒隊", "都會成棒隊", "海風成棒隊"];

const SCOUTING_TIER_ORDER: readonly ScoutingTier[] = [
  "unseen",
  "watchlist",
  "cross_check",
  "invited",
];

function initialScoutingState(): ScoutingState {
  return {
    exposure: 0,
    markets: {
      cpbl: { internalRating: 0, tier: "unseen", lastEvaluatedYear: null },
      npb: { internalRating: 0, tier: "unseen", lastEvaluatedYear: null },
      mlb: { internalRating: 0, tier: "unseen", lastEvaluatedYear: null },
    },
    draftEligibility: "none",
    draftAttempts: 0,
    reports: [],
  };
}

function supportsExpandedCareer(state: CareerState): boolean {
  return (
    state.engineVersion === MULTI_LEAGUE_ENGINE_VERSION || state.engineVersion === ENGINE_VERSION
  );
}

function supportsFourPositions(state: CareerState): boolean {
  return state.engineVersion === ENGINE_VERSION;
}

function abilityKeys(state: Pick<CareerState, "positionGroup">): readonly AbilityKey[] {
  if ((state.positionGroup ?? "pitcher") === "pitcher") return PITCHER_ABILITY_KEYS;
  return state.positionGroup === "catcher"
    ? [...HITTER_ABILITY_KEYS, "calling"]
    : HITTER_ABILITY_KEYS;
}

function eligibleCareerEvents(state: CareerState) {
  if (!supportsFourPositions(state)) return LEGACY_CAREER_EVENTS;
  return CAREER_EVENTS.filter(
    (event) =>
      !event.eligiblePositions ||
      event.eligiblePositions.includes(state.positionGroup ?? "pitcher"),
  );
}

function worldRandom(state: CareerState, context: string, drawKey: string): number {
  if (!supportsFourPositions(state)) return random(state);
  return keyedRandom(
    state.seed,
    state.engineVersion,
    SALARY_DUEL_RULESET_VERSION,
    state.positionGroup ?? "pitcher",
    state.year,
    "world",
    context,
    drawKey,
  );
}

function worldPick<T>(state: CareerState, context: string, values: readonly T[]): T {
  if (values.length === 0) throw new DomainError("沒有符合條件的世界事件候選");
  const value = values[Math.floor(worldRandom(state, context, "pick") * values.length)];
  if (value === undefined) throw new DomainError("世界事件選擇失敗");
  return value;
}

function worldChance(state: CareerState, context: string, percent: number): boolean {
  return worldRandom(state, context, "chance") * 100 < percent;
}

function keyedChance(
  state: CareerState,
  stream: "career" | "choiceOutcome",
  context: string,
  percent: number,
): boolean {
  if (!supportsFourPositions(state)) return chance(state, percent);
  return (
    keyedRandom(
      state.seed,
      state.engineVersion,
      SALARY_DUEL_RULESET_VERSION,
      state.positionGroup ?? "pitcher",
      state.year,
      stream,
      context,
      "chance",
    ) *
      100 <
    percent
  );
}

function initialAbilities(positionGroup: PositionGroup): AbilitySet {
  if (positionGroup === "pitcher") return { stamina: 24, velocity: 28, control: 24, breaking: 24 };
  const base: AbilitySet = {
    stamina: 24,
    contact: 26,
    power: 23,
    speed: 25,
    eye: 23,
    range: 24,
    fielding: 25,
    arm: 25,
  };
  if (positionGroup === "catcher") base.calling = 25;
  return base;
}

function emptyForPosition(positionGroup: PositionGroup): AbilitySet {
  const value: AbilitySet = { stamina: 0 };
  const keys =
    positionGroup === "pitcher"
      ? PITCHER_ABILITY_KEYS
      : positionGroup === "catcher"
        ? [...HITTER_ABILITY_KEYS, "calling" as const]
        : HITTER_ABILITY_KEYS;
  for (const key of keys) value[key] = 0;
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function assertNever(value: never): never {
  throw new DomainError(`不支援的 action：${JSON.stringify(value)}`);
}

function unlockTrait(state: CareerState, key: TraitKey, events: string[]): void {
  if (state.traits[key]) return;
  state.traits[key] = true;
  const labels: Record<TraitKey, string> = {
    genius: "天才：22 歲前累積五顆 6，往後訓練骰最低為 4。",
    fragile: "玻璃人：兩次大傷後，往後受傷風險提高。",
    iron_man: "鐵人：連續五季健康，往後受傷風險降低。",
    late_bloomer: "大器晚成：25 歲後突破原本評價，潛力重新上修。",
    disciplined: "自律狂：三次保守選擇，衰退曲線延後兩年。",
    clutch: "大心臟：三次豪賭成功，豪賭成功率不再受罰。",
    rubber_arm: "橡膠手臂：兩次打針成功，TJ 負荷上限提升。",
  };
  events.push(`隱藏特性解鎖｜${labels[key]}`);
}

function rollPotential(state: CareerState): AbilitySet {
  const keys = abilityKeys(state);
  const signature = pick(state, keys);
  const potential = emptyForPosition(state.positionGroup ?? "pitcher");
  for (const key of keys) {
    potential[key] = key === signature ? randomInt(state, 70, 80) : randomInt(state, 46, 66);
  }
  return potential;
}

function createTrainingDecision(state: CareerState): void {
  const roll = random(state);
  const count =
    state.injury.rehabSeasons > 0 ? 2 : roll < 0.35 ? 3 : roll < 0.75 ? 4 : roll < 0.95 ? 5 : 6;
  const dice: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const die = state.traits.genius ? randomInt(state, 4, 6) : randomInt(state, 1, 6);
    dice.push(die);
    if (die === 6 && state.age < 22 && !state.traits.genius) state.counters.sixesBefore22 += 1;
  }
  if (state.counters.sixesBefore22 >= TRAIT_THRESHOLDS.geniusSixesBefore22) {
    const events: string[] = [];
    unlockTrait(state, "genius", events);
    state.lastOutcome.push(...events);
  }
  state.pending =
    state.engineVersion === LEGACY_ENGINE_VERSION
      ? { type: "training", points: dice.reduce((sum, die) => sum + die, 0), dice }
      : { type: "training", dice, assignments: [] };
}

function beginYear(state: CareerState): void {
  if (state.stage === "retired") return;
  if (state.stage === "professional" && (state.positionGroup ?? "pitcher") === "pitcher")
    state.pending = { type: "pitch_effort" };
  else createTrainingDecision(state);
}

export function createCareerState(
  name: string,
  seed: string,
  engineVersion: string = ENGINE_VERSION,
  positionGroup: PositionGroup = "pitcher",
): CareerState {
  if (engineVersion !== ENGINE_VERSION) positionGroup = "pitcher";
  const normalizedSeed = seed.trim().slice(0, 24) || "yakyulife";
  const state: CareerState = {
    schemaVersion: engineVersion === LEGACY_ENGINE_VERSION ? 1 : STATE_SCHEMA_VERSION,
    engineVersion,
    upstreamCommit: engineVersion === ENGINE_VERSION ? UPSTREAM_COMMIT : LEGACY_UPSTREAM_COMMIT,
    seed: normalizedSeed,
    rngState: initialRngState(normalizedSeed),
    positionGroup,
    primaryPosition:
      positionGroup === "pitcher" ? "P" : (POSITION_CANDIDATES[positionGroup][0] ?? "DH"),
    utilityRole: false,
    scouting: initialScoutingState(),
    name: name.trim().slice(0, 10) || `無名${positionGroup === "pitcher" ? "投手" : "球員"}`,
    age: 16,
    year: 2026,
    stage: "high_school",
    stageYear: 1,
    level: "amateur",
    team: "",
    role: "starter",
    abilities: initialAbilities(positionGroup),
    potential: emptyForPosition(positionGroup),
    trainingCarry: emptyForPosition(positionGroup),
    traits: {
      genius: false,
      fragile: false,
      iron_man: false,
      late_bloomer: false,
      disciplined: false,
      clutch: false,
      rubber_arm: false,
    },
    counters: {
      sixesBefore22: 0,
      conservativeChoices: 0,
      boldSuccesses: 0,
      majorInjuries: 0,
      healthySeasons: 0,
      successfulInjections: 0,
    },
    contract: {
      annualSalary: 0,
      yearsRemaining: 0,
      serviceYears: 0,
      totalEarnings: 0,
      topLevelServiceYears: 0,
      clubControlled: true,
      peakAnnualSalary: 0,
    },
    injury: {
      rehabSeasons: 0,
      temporaryPenalty: 0,
      tjLoad: 0,
      tjCount: 0,
    },
    pitchEffort: "normal",
    seasons: [],
    honors: [],
    pending: null,
    lastOutcome: [
      `球員誕生｜從高中一年級展開${positionGroup === "pitcher" ? "投手" : "野手"}生涯。`,
    ],
    summary: null,
  };
  if (engineVersion !== LEGACY_ENGINE_VERSION) {
    state.life = {
      status: "single",
      partner: null,
      datingYears: 0,
      marriedYears: 0,
      children: 0,
      formerPartners: [],
      affairs: 0,
      caughtAffairs: 0,
    };
    state.offseasonFatigue = 0;
    state.recentEvents = [
      {
        year: state.year,
        age: state.age,
        category: "career",
        tone: "good",
        title: "球員誕生",
        body: `從高中一年級展開${positionGroup === "pitcher" ? "投手" : "野手"}生涯。`,
      },
    ];
  }
  if (engineVersion !== ENGINE_VERSION) {
    delete state.positionGroup;
    delete state.primaryPosition;
    delete state.utilityRole;
    delete state.scouting;
    delete state.contract.topLevelServiceYears;
    delete state.contract.clubControlled;
    delete state.contract.peakAnnualSalary;
  }
  for (const key of abilityKeys(state))
    state.abilities[key] =
      (state.abilities[key] ?? 0) + randomInt(state, 0, key === "velocity" ? 7 : 5);
  state.potential = rollPotential(state);
  state.team = pick(state, HIGH_SCHOOLS);
  beginYear(state);
  return state;
}

function spendTrainingPoints(state: CareerState, key: AbilityKey, points: number): number {
  let remaining = points;
  let gained = 0;
  while (remaining > 0 && (state.abilities[key] ?? 0) < 80) {
    const cost = abilityCost(state, key);
    const needed = cost - (state.trainingCarry[key] ?? 0);
    const spent = Math.min(remaining, needed);
    state.trainingCarry[key] = (state.trainingCarry[key] ?? 0) + spent;
    remaining -= spent;
    if ((state.trainingCarry[key] ?? 0) >= cost) {
      state.trainingCarry[key] = 0;
      state.abilities[key] = (state.abilities[key] ?? 0) + 1;
      gained += 1;
    }
  }
  return gained;
}

function allocateTraining(
  state: CareerState,
  action: Extract<GameAction, { type: "allocate_training" }>,
  events: string[],
): void {
  if (state.pending?.type !== "training") throw new DomainError("目前不是訓練階段");
  if (action.primary === action.secondary) throw new DomainError("主修與副修能力不可相同");
  if (state.engineVersion !== LEGACY_ENGINE_VERSION)
    throw new DomainError("新版生涯必須逐顆分配訓練骰");
  const points = state.pending.points ?? state.pending.dice.reduce((sum, die) => sum + die, 0);
  const primaryPoints = Math.ceil(points * 0.7);
  const secondaryPoints = points - primaryPoints;
  const primaryGain = spendTrainingPoints(state, action.primary, primaryPoints);
  const secondaryGain = spendTrainingPoints(state, action.secondary, secondaryPoints);
  events.push(
    `季初特訓｜${points} 點分配至${ABILITY_LABELS[action.primary]}與${ABILITY_LABELS[action.secondary]}，能力分別提升 ${primaryGain}、${secondaryGain}。`,
  );
  if (state.injury.rehabSeasons > 0) finishSeason(state, events, "rehab");
  else {
    const event = supportsFourPositions(state)
      ? worldPick(state, "annual-career-event", eligibleCareerEvents(state))
      : pick(state, eligibleCareerEvents(state));
    state.pending = { type: "event", eventId: event.id };
  }
}

function trainingDecision(state: CareerState) {
  if (state.pending?.type !== "training") throw new DomainError("目前不是訓練階段");
  if (state.engineVersion === LEGACY_ENGINE_VERSION)
    throw new DomainError("舊版生涯不支援逐骰配點");
  return state.pending;
}

function assignTrainingDie(
  state: CareerState,
  action: Extract<GameAction, { type: "assign_training_die" }>,
  events: string[],
): void {
  const pending = trainingDecision(state);
  const assignments = pending.assignments ?? [];
  if (assignments.length >= pending.dice.length) throw new DomainError("所有訓練骰都已分配");
  const preview = trainingPreview(state);
  if (
    (preview.abilities[action.ability] ?? 0) >= 80 &&
    !abilityKeys(state).every((key) => (preview.abilities[key] ?? 0) >= 80)
  )
    throw new DomainError("這項能力已達上限，請選擇其他能力");
  pending.assignments = [...assignments, action.ability];
  const die = pending.dice[assignments.length];
  events.push(
    `訓練骰暫存｜將 ${die ?? 0} 點指派給${ABILITY_LABELS[action.ability]}，確認前仍可復原。`,
  );
}

function undoTrainingDie(state: CareerState, events: string[]): void {
  const pending = trainingDecision(state);
  const assignments = pending.assignments ?? [];
  const ability = assignments.at(-1);
  if (!ability) throw new DomainError("目前沒有可復原的訓練骰");
  pending.assignments = assignments.slice(0, -1);
  events.push(`復原訓練骰｜取消上一顆對${ABILITY_LABELS[ability]}的指派。`);
}

export function trainingPreview(state: CareerState): {
  abilities: AbilitySet;
  carry: AbilitySet;
  gains: AbilitySet;
} {
  const copy = structuredClone(state);
  const pending = copy.pending;
  const before = { ...copy.abilities };
  if (pending?.type === "training") {
    for (const [index, ability] of (pending.assignments ?? []).entries()) {
      spendTrainingPoints(copy, ability, pending.dice[index] ?? 0);
    }
  }
  return {
    abilities: { ...copy.abilities },
    carry: { ...copy.trainingCarry },
    gains: Object.fromEntries(
      abilityKeys(copy).map((key) => [key, (copy.abilities[key] ?? 0) - (before[key] ?? 0)]),
    ) as unknown as AbilitySet,
  };
}

function confirmTraining(state: CareerState, events: string[]): void {
  const pending = trainingDecision(state);
  const assignments = pending.assignments ?? [];
  const allCapped = abilityKeys(state).every(
    (key) => (trainingPreview(state).abilities[key] ?? 0) >= 80,
  );
  if (assignments.length < pending.dice.length && !allCapped)
    throw new DomainError("請先分配所有訓練骰");
  const gains = emptyForPosition(state.positionGroup ?? "pitcher");
  const spent = emptyForPosition(state.positionGroup ?? "pitcher");
  for (const [index, ability] of assignments.entries()) {
    const points = pending.dice[index] ?? 0;
    spent[ability] = (spent[ability] ?? 0) + points;
    gains[ability] = (gains[ability] ?? 0) + spendTrainingPoints(state, ability, points);
  }
  const details = abilityKeys(state)
    .filter((key) => (spent[key] ?? 0) > 0)
    .map((key) => `${ABILITY_LABELS[key]} ${spent[key]} 點（能力 +${gains[key]}）`)
    .join("、");
  events.push(`季初特訓｜逐骰分配完成：${details || "能力已滿，剩餘骰子捨棄"}。`);
  if (state.injury.rehabSeasons > 0) finishSeason(state, events, "rehab");
  else {
    const event = supportsFourPositions(state)
      ? worldPick(state, "annual-career-event", eligibleCareerEvents(state))
      : pick(state, eligibleCareerEvents(state));
    state.pending = { type: "event", eventId: event.id };
  }
}

function choosePitchEffort(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_pitch_effort" }>,
  events: string[],
): void {
  if (state.pending?.type !== "pitch_effort") throw new DomainError("目前不是投球規劃階段");
  state.pitchEffort = action.effort;
  events.push(`投球規劃｜本季採用「${EFFORT_CONFIG[action.effort].label}」。`);
  createTrainingDecision(state);
}

function eventRule(eventId: string) {
  const rule = [...LEGACY_CAREER_EVENTS, ...CAREER_EVENTS].find((event) => event.id === eventId);
  if (!rule) throw new DomainError("找不到事件規則");
  return rule;
}

function chooseEvent(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_event" }>,
  events: string[],
): void {
  if (state.pending?.type !== "event") throw new DomainError("目前沒有等待處理的事件");
  const rule = eventRule(state.pending.eventId);
  const adjust = (ability: AbilityKey, delta: number): void => {
    state.abilities[ability] = clamp((state.abilities[ability] ?? 0) + delta, 1, 80);
  };
  if (
    [
      "catcher_collision",
      "double_play_turn",
      "wall_catch",
      "rain_makeup",
      "position_role_meeting",
      "family_tournament_conflict",
    ].includes(rule.id)
  ) {
    if (action.strategy === "normal") throw new DomainError("此事件只提供兩個有效選項");
    let outcome = "";
    if (rule.id === "catcher_collision") {
      if (action.strategy === "safe") {
        adjust("fielding", 1);
        state.injury.temporaryPenalty = Math.max(0, state.injury.temporaryPenalty - 4);
        outcome = "穩定完成觸殺，守備 +1、傷病風險 -4";
      } else if (keyedChance(state, "choiceOutcome", rule.id, 50)) {
        adjust("fielding", 2);
        adjust("arm", 1);
        state.seasonDefenseBonus = 2;
        outcome = "瞬間觸殺成功，守備 +2、臂力 +1、DEF +2";
      } else {
        adjust("fielding", -1);
        state.injury.temporaryPenalty += 10;
        outcome = "偏傳處理失敗，守備 -1、傷病風險 +10";
      }
    } else if (rule.id === "double_play_turn") {
      if (action.strategy === "safe") {
        adjust("fielding", 1);
        outcome = "穩傳完成出局，守備 +1";
      } else if (keyedChance(state, "choiceOutcome", rule.id, 50)) {
        adjust("range", 1);
        adjust("arm", 1);
        state.seasonDefenseBonus = 2;
        outcome = "完整雙殺成功，守備範圍 +1、臂力 +1、DEF +2";
      } else {
        adjust("fielding", -1);
        state.injury.temporaryPenalty += 8;
        outcome = "快轉失敗，守備 -1、傷病風險 +8";
      }
    } else if (rule.id === "wall_catch") {
      if (action.strategy === "safe") {
        adjust("fielding", 1);
        state.injury.temporaryPenalty = Math.max(0, state.injury.temporaryPenalty - 4);
        outcome = "安全處理，守備 +1、傷病風險 -4";
      } else if (keyedChance(state, "choiceOutcome", rule.id, 45)) {
        adjust("range", 2);
        state.seasonDefenseBonus = 3;
        outcome = "牆前接殺成功，守備範圍 +2、DEF +3";
      } else {
        adjust("stamina", -1);
        state.injury.temporaryPenalty += 12;
        outcome = "撞牆未能接牢，體力 -1、傷病風險 +12";
      }
    } else if (rule.id === "rain_makeup") {
      state.seasonAppearanceModifier = action.strategy === "safe" ? -0.08 : 0.06;
      const risk =
        action.strategy === "safe" ? -8 : 8 + (state.positionGroup === "catcher" ? 4 : 0);
      state.injury.temporaryPenalty = Math.max(0, state.injury.temporaryPenalty + risk);
      outcome =
        action.strategy === "safe"
          ? "出賽機會 -8%、傷病風險 -8"
          : `出賽機會 +6%、傷病風險 +${risk}`;
    } else if (rule.id === "position_role_meeting") {
      if (action.strategy === "safe") {
        adjust("fielding", 2);
        outcome = "固定守位訓練，守備 +2";
      } else {
        for (const ability of ["fielding", "range", "arm"] as const) adjust(ability, 1);
        state.utilityRole = true;
        state.seasonAppearanceModifier = 0.1;
        state.positionSalaryBonusDisabled = true;
        outcome = "接受多守位調度，守備、範圍、臂力各 +1，出賽下限提高";
      }
    } else {
      state.internationalEventChoice = action.strategy === "safe" ? "family" : "baseball";
      const risk = action.strategy === "safe" ? -8 : 8;
      state.injury.temporaryPenalty = Math.max(0, state.injury.temporaryPenalty + risk);
      outcome =
        action.strategy === "safe"
          ? "選擇家庭，本次不參賽、下季風險 -8"
          : "選擇棒球，接受國際賽、風險 +8";
    }
    events.push(`${rule.title}｜${outcome}。`);
    finishSeason(state, events, "normal");
    return;
  }
  const config = STRATEGY_CONFIG[action.strategy];
  const ability =
    rule.abilityByPosition?.[state.positionGroup ?? "pitcher"] ??
    (abilityKeys(state).includes(rule.ability) ? rule.ability : "stamina");
  let successChance = config.successChance;
  if (action.strategy === "bold" && state.traits.clutch) successChance = 50;
  const success = keyedChance(
    state,
    "choiceOutcome",
    `${rule.id}-${action.strategy}`,
    successChance,
  );
  const delta = success ? config.magnitude : -config.magnitude;
  state.abilities[ability] = clamp((state.abilities[ability] ?? 0) + delta, 1, 80);

  if (action.strategy === "safe") {
    state.counters.conservativeChoices += 1;
    if (state.counters.conservativeChoices >= TRAIT_THRESHOLDS.disciplinedChoices)
      unlockTrait(state, "disciplined", events);
  }
  if (action.strategy === "bold" && success) {
    state.counters.boldSuccesses += 1;
    if (state.counters.boldSuccesses >= TRAIT_THRESHOLDS.clutchBoldSuccesses)
      unlockTrait(state, "clutch", events);
  }
  if (!success && rule.injuryRisk) state.injury.temporaryPenalty += rule.injuryRisk;

  events.push(
    `${rule.title}｜${config.label}${success ? "成功" : "失敗"}，${ABILITY_LABELS[ability]} ${delta > 0 ? "+" : ""}${delta}。`,
  );
  finishSeason(state, events, "normal");
}

function injuryResult(state: CareerState): "none" | "minor" | "major" {
  const ageRisk = state.age >= 35 ? 12 : state.age >= 32 ? 6 : 0;
  const traitRisk = state.traits.fragile ? 18 : state.traits.iron_man ? -12 : 0;
  const risk = clamp(
    24 + ageRisk + traitRisk + state.injury.temporaryPenalty + (state.offseasonFatigue ?? 0),
    4,
    80,
  );
  state.injury.temporaryPenalty = 0;
  if (state.engineVersion !== LEGACY_ENGINE_VERSION) state.offseasonFatigue = 0;
  if (!keyedChance(state, "career", "primary-season-injury", risk)) return "none";
  return keyedChance(state, "career", "primary-season-injury-severity", 24) ? "major" : "minor";
}

function currentLevelConfig(level: LeagueLevel): { games: number; par: number } {
  const rule = LEAGUE_RULES[level];
  return { games: rule.games, par: rule.par };
}

function assignDefensivePosition(state: CareerState): DefensivePosition {
  const group = state.positionGroup ?? "pitcher";
  if (group === "pitcher") return "P";
  const candidates = POSITION_CANDIDATES[group];
  const position =
    candidates.find(
      (candidate) =>
        candidate === "DH" ||
        defensiveScore(state, candidate) >= positionThreshold(state.level, candidate, state.age),
    ) ?? "DH";
  state.primaryPosition = position;
  return position;
}

function simulateHitterSeason(
  state: CareerState,
  injury: "none" | "minor" | "major" | "rehab",
): SeasonStats {
  const config = currentLevelConfig(state.level);
  const difference = overall(state) - config.par;
  const seasonFactor =
    injury === "rehab" ? 0 : injury === "major" ? 0.08 : injury === "minor" ? 0.55 : 1;
  const position = assignDefensivePosition(state);
  const utilityBoost = state.utilityRole ? 0.1 : 0;
  const appearanceModifier = state.seasonAppearanceModifier ?? 0;
  const games = Math.min(
    config.games,
    Math.round(
      config.games *
        clamp(0.62 + difference * 0.012 + utilityBoost + appearanceModifier, 0.2, 1) *
        seasonFactor,
    ),
  );
  const plateAppearances = Math.round(games * clamp(3.75 + difference * 0.025, 2.5, 4.5));
  const walkRate = clamp(0.055 + ((state.abilities.eye ?? 0) - config.par) * 0.0022, 0.025, 0.18);
  const walks = Math.round(plateAppearances * walkRate);
  const atBats = Math.max(0, plateAppearances - walks - Math.round(plateAppearances * 0.03));
  const average =
    atBats === 0
      ? 0
      : round1(
          clamp(
            0.235 +
              ((state.abilities.contact ?? 0) - config.par) * 0.004 +
              (random(state) - 0.5) * 0.035,
            0.12,
            0.42,
          ) * 1000,
        ) / 1000;
  const hits = Math.min(atBats, Math.round(atBats * average));
  const homeRuns = Math.min(
    hits,
    Math.round(
      atBats * clamp(0.012 + ((state.abilities.power ?? 0) - config.par) * 0.0017, 0, 0.105),
    ),
  );
  const doublesTriples = Math.min(
    hits - homeRuns,
    Math.round(
      (hits - homeRuns) *
        clamp(0.2 + ((state.abilities.speed ?? 0) - config.par) * 0.003, 0.12, 0.38),
    ),
  );
  const totalBases = Math.max(0, hits + doublesTriples + homeRuns * 3);
  const onBasePercentage =
    plateAppearances === 0 ? 0 : round1(((hits + walks) / plateAppearances) * 1000) / 1000;
  const slugging = atBats === 0 ? 0 : round1((totalBases / atBats) * 1000) / 1000;
  const ops = round1((onBasePercentage + slugging) * 1000) / 1000;
  const rbis = Math.round(
    homeRuns * 1.25 + Math.max(0, hits - homeRuns) * clamp(0.16 + difference * 0.003, 0.08, 0.34),
  );
  const stolenBases = Math.round(
    games * clamp(((state.abilities.speed ?? 0) - 24) * 0.004, 0, 0.28),
  );
  const defense =
    Math.round(
      (defensiveScore(state, position) - config.par) * (games / Math.max(1, config.games)) * 4,
    ) + (state.seasonDefenseBonus ?? 0);
  const awards: string[] = [];
  const topLevel = ["cpbl1", "npb1", "mlb", "kbo1", "abl", "international"].includes(state.level);
  if (topLevel && plateAppearances >= config.games * 2.5 && ops >= 0.9) awards.push("年度最佳九人");
  if (topLevel && homeRuns >= Math.round(config.games * 0.2)) awards.push("全壘打王");
  if (topLevel && average >= 0.32) awards.push("打擊王");
  if (topLevel && defense >= 8 && position !== "DH") awards.push("金手套");
  return {
    kind: "hitter",
    seasonId: `${state.year}-${LEAGUE_RULES[state.level].league}-primary-${state.seasons.length + 1}`,
    calendarYear: state.year,
    seasonLabel: `${state.year} ${LEVEL_LABELS[state.level]}`,
    league: LEAGUE_RULES[state.level].league,
    engagement: "primary",
    year: state.year,
    age: state.age,
    level: state.level,
    team: state.team,
    position,
    games,
    plateAppearances,
    atBats,
    hits,
    homeRuns,
    rbis,
    walks,
    stolenBases,
    average,
    onBasePercentage,
    slugging,
    ops,
    defense,
    injured: injury,
    awards,
  };
}

function simulateSeason(
  state: CareerState,
  injury: "none" | "minor" | "major" | "rehab",
): SeasonStats {
  if ((state.positionGroup ?? "pitcher") !== "pitcher") return simulateHitterSeason(state, injury);
  const config = currentLevelConfig(state.level);
  const role =
    state.abilities.stamina >= 52 ? "starter" : state.role === "closer" ? "closer" : "reliever";
  state.role = role;
  const effort = EFFORT_CONFIG[state.pitchEffort].performance;
  const difference = overall(state) - config.par + effort;
  const noise = (random(state) + random(state) - 1) * 1.2;
  const seasonFactor =
    injury === "rehab" ? 0 : injury === "major" ? 0.08 : injury === "minor" ? 0.55 : 1;
  const gamesBase = role === "starter" ? randomInt(state, 22, 30) : randomInt(state, 42, 65);
  const games = Math.round(
    Math.min(config.games, gamesBase) *
      clamp(1 + (state.seasonAppearanceModifier ?? 0), 0.2, 1.2) *
      seasonFactor,
  );
  const starts = role === "starter" ? games : 0;
  const inningsPerGame = role === "starter" ? 5.2 + clamp(difference, -8, 12) * 0.08 : 1.05;
  const innings = round1(Math.max(0, games * inningsPerGame));
  const era = innings === 0 ? 0 : round1(clamp(4.6 - difference * 0.13 + noise, 1.2, 9.9));
  const strikeoutRate = clamp(
    5.2 + ((state.abilities.velocity ?? 0) + (state.abilities.breaking ?? 0) - 80) * 0.1,
    3,
    13.5,
  );
  const strikeouts = Math.round((innings / 9) * strikeoutRate);
  const decisionGames = role === "starter" ? games * 0.72 : games * 0.18;
  const winRate = clamp(0.48 + difference * 0.012, 0.2, 0.78);
  const wins = Math.round(decisionGames * winRate);
  const losses = Math.max(0, Math.round(decisionGames) - wins);
  const saves =
    role === "closer" ? Math.round(games * clamp(0.52 + difference * 0.01, 0.2, 0.8)) : 0;
  const holds =
    role === "reliever" ? Math.round(games * clamp(0.28 + difference * 0.008, 0.1, 0.55)) : 0;
  const awards: string[] = [];
  if (state.engineVersion === LEGACY_ENGINE_VERSION) {
    if (state.level === "cpbl1" && difference >= 8 && innings >= 80) awards.push("年度最佳投手");
    if (state.level === "cpbl1" && strikeouts >= 150) awards.push("三振王");
    if (state.level === "cpbl1" && saves >= 30) awards.push("救援王");
    if (state.level === "cpbl1" && difference >= 4) awards.push("明星賽");
  } else {
    const topLevel = ![
      "amateur",
      "cpbl2",
      "npb2",
      "rookie",
      "a",
      "high_a",
      "aa",
      "aaa",
      "kbo2",
    ].includes(state.level);
    if (topLevel && difference >= 8 && innings >= Math.min(80, config.games * 0.65))
      awards.push("年度最佳投手");
    if (topLevel && strikeouts >= Math.round(config.games * 1.1)) awards.push("三振王");
    if (topLevel && saves >= Math.min(30, Math.round(config.games * 0.23))) awards.push("救援王");
    if (topLevel && difference >= 4) awards.push("明星賽");
  }
  const base: SeasonStats = {
    year: state.year,
    age: state.age,
    level: state.level,
    team: state.team,
    role,
    games,
    starts,
    wins,
    losses,
    saves,
    holds,
    innings,
    strikeouts,
    earnedRuns: innings === 0 ? 0 : Math.round((era * innings) / 9),
    era,
    whip: innings === 0 ? 0 : round1(clamp(1.38 - difference * 0.018 + noise * 0.08, 0.75, 2.2)),
    injured: injury,
    awards,
  };
  if (state.engineVersion === LEGACY_ENGINE_VERSION) return base;
  const league = LEAGUE_RULES[state.level].league;
  return {
    seasonId: `${state.year}-${league}-primary-${state.seasons.length + 1}`,
    calendarYear: state.year,
    seasonLabel: `${state.year} ${LEVEL_LABELS[state.level]}`,
    league,
    engagement: "primary",
    ...base,
  };
}

function applyAging(state: CareerState, events: string[]): void {
  const adjustedAge = state.age - (state.traits.disciplined ? 2 : 0);
  if (adjustedAge < 32) return;
  const loss = adjustedAge >= 35 ? 5 + (adjustedAge - 35) : 2;
  for (const key of abilityKeys(state))
    state.abilities[key] = clamp((state.abilities[key] ?? 0) - loss, 1, 80);
  events.push(`歲月不饒人｜所有能力下降 ${loss}。`);
}

function finishSeason(state: CareerState, events: string[], forced: "normal" | "rehab"): void {
  const injury = forced === "rehab" ? "rehab" : injuryResult(state);
  if (injury === "rehab") {
    events.push("整季復健｜受 TJ 手術影響，本季專注復健，不列出戰績資訊。");
  } else if (injury === "major") {
    state.counters.majorInjuries += 1;
    state.counters.healthySeasons = 0;
    state.injury.rehabSeasons = chance(state, 50) ? 1 : 0;
    for (const key of abilityKeys(state))
      state.abilities[key] = clamp((state.abilities[key] ?? 0) - 5, 1, 80);
    events.push("重大傷勢｜本季幾乎報銷，所有能力 -5。 ");
    if (state.counters.majorInjuries >= TRAIT_THRESHOLDS.fragileMajorInjuries)
      unlockTrait(state, "fragile", events);
  } else if (injury === "minor") {
    state.counters.healthySeasons = 0;
    events.push("小傷纏身｜本季出賽與局數受到影響。 ");
  } else if (injury === "none") {
    state.counters.healthySeasons += 1;
    if (state.counters.healthySeasons >= TRAIT_THRESHOLDS.ironManHealthySeasons)
      unlockTrait(state, "iron_man", events);
  }

  const stats = simulateSeason(state, injury);
  if (supportsFourPositions(state)) {
    state.seasonAppearanceModifier = 0;
    state.seasonDefenseBonus = 0;
  }
  state.seasons.push(stats);
  state.honors.push(...stats.awards.map((award) => `${state.year} ${award}`));
  if (state.stage === "professional") {
    state.contract.totalEarnings += state.contract.annualSalary;
    if (supportsFourPositions(state))
      state.contract.peakAnnualSalary = Math.max(
        state.contract.peakAnnualSalary ?? 0,
        state.contract.annualSalary,
      );
    if ((state.positionGroup ?? "pitcher") === "pitcher") {
      const tjBase =
        (((state.abilities.velocity ?? 0) + (state.abilities.breaking ?? 0)) / 19) *
        EFFORT_CONFIG[state.pitchEffort].tjMultiplier;
      state.injury.tjLoad += tjBase * (state.injury.tjCount > 0 ? 1.15 : 1);
    }
  }
  if (injury !== "major" && injury !== "rehab") {
    events.push(
      "innings" in stats
        ? `${state.year} 球季｜${LEVEL_LABELS[state.level]} ${stats.games} 場、${stats.innings} 局、${stats.wins} 勝、${stats.saves} 救援、ERA ${stats.era.toFixed(1)}。`
        : `${state.year} 球季｜${LEVEL_LABELS[state.level]} ${stats.games} 場、${stats.hits} 安、${stats.homeRuns} 轟、OPS ${stats.ops.toFixed(3)}、DEF ${stats.defense}。`,
    );
  }
  if (stats.awards.length > 0) events.push(`本季榮譽｜${stats.awards.join("、")}。`);

  if (
    state.age >= TRAIT_THRESHOLDS.lateBloomerMinimumAge &&
    !state.traits.late_bloomer &&
    overall(state) < TRAIT_THRESHOLDS.lateBloomerMaximumOverall &&
    chance(state, TRAIT_THRESHOLDS.lateBloomerChance)
  ) {
    unlockTrait(state, "late_bloomer", events);
    for (const key of abilityKeys(state)) {
      state.potential[key] = clamp((state.potential[key] ?? 0) + 8, 1, 80);
      state.abilities[key] = clamp((state.abilities[key] ?? 0) + 3, 1, 80);
    }
  }

  if (forced === "rehab") state.injury.rehabSeasons = Math.max(0, state.injury.rehabSeasons - 1);
  const tjCap = state.traits.rubber_arm ? 100 : 50;
  if (
    state.stage === "professional" &&
    (state.positionGroup ?? "pitcher") === "pitcher" &&
    state.injury.tjLoad >= tjCap
  )
    state.pending = { type: "tj" };
  else beginOffFieldPhase(state, events);
}

const PARTNER_NAMES = ["小葵", "若晴", "恩熙", "智雅", "艾蜜莉", "夏洛特"];

function beginOffFieldPhase(state: CareerState, events: string[]): void {
  if (!supportsExpandedCareer(state) || state.stage !== "professional" || !state.life) {
    resolvePostSeason(state, events);
    return;
  }
  if (state.age >= 20 && chance(state, 22)) {
    const life = state.life;
    const eventId =
      life.status === "single" || life.status === "divorced"
        ? "dating"
        : life.status === "dating" && life.datingYears >= 2
          ? "proposal"
          : life.status === "married" && chance(state, 24)
            ? "temptation"
            : "anniversary";
    state.pending = { type: "life", eventId };
    return;
  }
  maybeOfferInternational(state, events);
}

function maybeOfferInternational(state: CareerState, events: string[]): void {
  const classic = (state.year - 2026) % 4 === 0;
  const premier = (state.year - 2028) % 4 === 0;
  const eventChoice = state.internationalEventChoice;
  state.internationalEventChoice = null;
  if (eventChoice === "family") {
    maybeOfferAbl(state, events);
    return;
  }
  if (
    supportsExpandedCareer(state) &&
    state.stage === "professional" &&
    (eventChoice === "baseball" || classic || premier) &&
    (eventChoice === "baseball" || overall(state) >= 50) &&
    state.injury.rehabSeasons === 0
  ) {
    state.pending = {
      type: "international",
      tournament: classic ? "世界棒球經典賽" : "世界12強賽",
      forced: eventChoice === "baseball" || state.age < 25,
    };
    return;
  }
  maybeOfferAbl(state, events);
}

function maybeOfferAbl(state: CareerState, events: string[]): void {
  if (
    supportsExpandedCareer(state) &&
    state.stage === "professional" &&
    state.level !== "abl" &&
    state.age <= 36 &&
    state.injury.rehabSeasons === 0 &&
    (supportsFourPositions(state) ? worldChance(state, "abl-invitation", 18) : chance(state, 18))
  ) {
    state.pending = {
      type: "abl",
      team: supportsFourPositions(state)
        ? worldPick(state, "abl-team", LEAGUE_TEAMS.abl)
        : pick(state, LEAGUE_TEAMS.abl),
      mode: "offseason",
    };
    return;
  }
  resolvePostSeason(state, events);
}

function chooseLife(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_life" }>,
  events: string[],
): void {
  if (state.pending?.type !== "life" || !state.life) throw new DomainError("目前沒有感情抉擇");
  const eventId = state.pending.eventId;
  const life = state.life;
  if (eventId === "dating") {
    if (action.choice === "accept") {
      life.status = "dating";
      life.partner = pick(state, PARTNER_NAMES);
      life.datingYears = 0;
      events.push(`場外緣分｜與${life.partner}開始交往，人生多了一位重要夥伴。`);
    } else events.push("場外緣分｜選擇把注意力留在球場，婉拒了這段緣分。");
  } else if (eventId === "proposal") {
    if (action.choice === "accept") {
      life.status = "married";
      life.marriedYears = 0;
      state.abilities.stamina = clamp(state.abilities.stamina + 1, 1, 80);
      events.push(`婚禮｜與${life.partner ?? "伴侶"}完婚，安定生活讓體力 +1。`);
    } else if (chance(state, 45)) {
      if (life.partner) life.formerPartners.push(life.partner);
      events.push(`分手｜婚期一再延後，${life.partner ?? "伴侶"}選擇離開。`);
      life.status = "single";
      life.partner = null;
      life.datingYears = 0;
    } else events.push("婚期延後｜兩人決定再給彼此一些時間。");
  } else if (eventId === "temptation") {
    if (action.choice === "bold") {
      life.affairs += 1;
      if (chance(state, 45)) {
        life.caughtAffairs += 1;
        if (life.partner) life.formerPartners.push(life.partner);
        life.status = "divorced";
        life.partner = null;
        const mentalKey: AbilityKey =
          (state.positionGroup ?? "pitcher") === "pitcher" ? "control" : "eye";
        state.abilities[mentalKey] = clamp((state.abilities[mentalKey] ?? 0) - 3, 1, 80);
        events.push("婚姻危機｜外遇曝光並以離婚收場，控球 -3。");
      } else {
        state.abilities.stamina = clamp(state.abilities.stamina + 1, 1, 80);
        events.push("危險赴約｜暫時沒有曝光，但這個選擇已留在生涯紀錄中，體力 +1。");
      }
    } else {
      const mentalKey: AbilityKey =
        (state.positionGroup ?? "pitcher") === "pitcher" ? "control" : "eye";
      state.abilities[mentalKey] = clamp((state.abilities[mentalKey] ?? 0) + 1, 1, 80);
      events.push("守住承諾｜拒絕誘惑並專注家庭，控球 +1。");
    }
  } else {
    if (action.choice === "accept") {
      state.injury.temporaryPenalty = Math.max(0, state.injury.temporaryPenalty - 5);
      if (life.status === "married" && chance(state, 25)) {
        life.children += 1;
        events.push(
          `家庭新成員｜與${life.partner ?? "伴侶"}迎接第 ${life.children} 個孩子，下季傷病風險下降。`,
        );
      } else events.push(`家庭時光｜陪伴${life.partner ?? "家人"}度過重要日子，下季傷病風險下降。`);
    } else {
      const trainingKey: AbilityKey =
        (state.positionGroup ?? "pitcher") === "pitcher" ? "velocity" : "contact";
      state.abilities[trainingKey] = clamp((state.abilities[trainingKey] ?? 0) + 1, 1, 80);
      events.push(`加練優先｜錯過家庭時光換來訓練成果，${ABILITY_LABELS[trainingKey]} +1。`);
    }
  }
  maybeOfferInternational(state, events);
}

function simulateInternationalTournament(
  state: CareerState,
  tournament: "世界棒球經典賽" | "世界12強賽",
): SeasonStats {
  const previous = { level: state.level, team: state.team, role: state.role };
  state.level = "international";
  state.team = "中華隊";
  let stats: SeasonStats;
  if ((state.positionGroup ?? "pitcher") === "pitcher") {
    const role = state.role;
    const games = role === "starter" ? randomInt(state, 1, 2) : randomInt(state, 3, 6);
    const starts = role === "starter" ? games : 0;
    const innings = round1(
      games * (role === "starter" ? 4.5 + random(state) * 2.5 : 0.8 + random(state) * 0.8),
    );
    const difference = overall(state) - LEAGUE_RULES.international.par;
    const era = round1(clamp(4.2 - difference * 0.12 + (random(state) - 0.5), 0, 9.9));
    stats = {
      kind: "pitcher",
      year: state.year,
      age: state.age,
      level: "international",
      team: "中華隊",
      role,
      games,
      starts,
      wins: role === "starter" ? Math.min(games, Math.max(0, Math.round(games * 0.5))) : 0,
      losses: 0,
      saves: role === "closer" ? Math.max(0, Math.round(games * 0.5)) : 0,
      holds: role === "reliever" ? Math.max(0, Math.round(games * 0.4)) : 0,
      innings,
      strikeouts: Math.round((innings / 9) * clamp(7 + difference * 0.12, 3, 14)),
      earnedRuns: Math.round((era * innings) / 9),
      era,
      whip: round1(clamp(1.25 - difference * 0.014 + (random(state) - 0.5) * 0.15, 0.7, 2.1)),
      injured: "none",
      awards: [],
      league: "international",
      engagement: "offseason",
    };
  } else {
    stats = simulateHitterSeason(state, "none");
    stats.games = randomInt(state, 5, 8);
    if (stats.kind === "hitter") {
      const factor = stats.games / Math.max(1, LEAGUE_RULES.international.games);
      stats.plateAppearances = Math.round(stats.games * 4);
      stats.atBats = Math.min(stats.plateAppearances, Math.round(stats.atBats * factor));
      stats.hits = Math.min(stats.atBats, Math.round(stats.hits * factor));
      stats.homeRuns = Math.min(stats.hits, Math.round(stats.homeRuns * factor));
      stats.rbis = Math.round(stats.rbis * factor);
      stats.walks = Math.max(0, stats.plateAppearances - stats.atBats);
    }
  }
  const resultRoll = overall(state) + randomInt(state, -12, 12);
  const result =
    resultRoll >= 68 ? "冠軍" : resultRoll >= 61 ? "四強" : resultRoll >= 54 ? "複賽" : "預賽";
  if (result === "冠軍") stats.awards.push(`${tournament}冠軍`);
  if (result === "四強") stats.awards.push(`${tournament}四強`);
  stats.seasonId = `${state.year}-international-${state.seasons.length + 1}`;
  stats.seasonLabel = `${state.year} ${tournament}｜${result}`;
  stats.engagement = "offseason";
  state.level = previous.level;
  state.team = previous.team;
  state.role = previous.role;
  return stats;
}

function chooseInternational(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_international" }>,
  events: string[],
): void {
  if (state.pending?.type !== "international") throw new DomainError("目前沒有國際賽徵召");
  const invitation = state.pending;
  if (action.choice === "decline" && invitation.forced)
    throw new DomainError("列管期間必須接受國家隊徵召");
  if (action.choice === "accept") {
    const stats = simulateInternationalTournament(state, invitation.tournament);
    state.seasons.push(stats);
    state.offseasonFatigue = (state.offseasonFatigue ?? 0) + 8;
    state.honors.push(...stats.awards.map((award) => `${state.year} ${award}`));
    events.push(
      "innings" in stats
        ? `國際賽徵召｜披上中華隊戰袍參加${invitation.tournament}，${stats.games} 場、${stats.innings} 局、${stats.strikeouts} K；結果記入生涯並增加下季疲勞。`
        : `國際賽徵召｜披上中華隊戰袍參加${invitation.tournament}，${stats.games} 場、${stats.hits} 安、${stats.homeRuns} 轟；結果記入生涯並增加下季疲勞。`,
    );
  } else events.push(`國際賽徵召｜婉拒${invitation.tournament}，留在母隊調整。`);
  maybeOfferAbl(state, events);
}

function simulateAblOffseason(state: CareerState, team: string): SeasonStats {
  const previous = { level: state.level, team: state.team, role: state.role };
  state.level = "abl";
  state.team = team;
  const injured = chance(state, 8) ? "minor" : "none";
  const stats = simulateSeason(state, injured);
  stats.seasonId = `${state.year}-abl-offseason-${state.seasons.length + 1}`;
  stats.seasonLabel = `${state.year}–${String(state.year + 1).slice(-2)} 澳職短期派遣`;
  stats.engagement = "offseason";
  state.level = previous.level;
  state.team = previous.team;
  state.role = previous.role;
  return stats;
}

function chooseAbl(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_abl" }>,
  events: string[],
): void {
  if (state.pending?.type !== "abl") throw new DomainError("目前沒有澳職邀請");
  const invitation = state.pending;
  if (action.choice === "accept") {
    const stats = simulateAblOffseason(state, invitation.team);
    state.seasons.push(stats);
    state.offseasonFatigue = (state.offseasonFatigue ?? 0) + 6;
    if (stats.injured === "none") {
      const key = pick(state, abilityKeys(state));
      state.abilities[key] = clamp((state.abilities[key] ?? 0) + 1, 1, 80);
      events.push(
        "innings" in stats
          ? `澳職派遣｜效力${invitation.team}，${stats.games} 場、${stats.innings} 局、ERA ${stats.era.toFixed(1)}；${ABILITY_LABELS[key]} +1，但下季疲勞上升。`
          : `澳職派遣｜效力${invitation.team}，${stats.games} 場、${stats.hits} 安、OPS ${stats.ops.toFixed(3)}；${ABILITY_LABELS[key]} +1，但下季疲勞上升。`,
      );
    } else events.push(`澳職派遣｜效力${invitation.team}期間出現小傷，下季疲勞與傷病風險上升。`);
  } else events.push(`澳職邀請｜婉拒${invitation.team}的短期派遣，留在臺灣完整休養。`);
  resolvePostSeason(state, events);
}

function advanceYear(state: CareerState, events: string[], incrementStageYear = false): void {
  state.year += 1;
  state.age += 1;
  if (state.life?.status === "dating") state.life.datingYears += 1;
  if (state.life?.status === "married") state.life.marriedYears += 1;
  if (incrementStageYear) state.stageYear += 1;
  applyAging(state, events);
  beginYear(state);
}

function contractOffers(state: CareerState): Array<{
  id?: string;
  kind: "long" | "short" | "overseas";
  years: number;
  salary: number;
  level?: LeagueLevel;
  team?: string;
  source?: "posting" | "fa" | "free_agent" | "injury_replacement" | "tryout";
}> {
  const rating = overall(state);
  const maximum = (state.positionGroup ?? "pitcher") === "pitcher" ? 7 : 15;
  const ageCap = Math.min(
    maximum,
    state.age >= 36 ? 2 : state.age >= 34 ? 3 : state.age >= 32 ? 5 : maximum,
  );
  if (state.engineVersion === LEGACY_ENGINE_VERSION) {
    const legacyBase = state.level === "cpbl1" ? 300 + Math.max(0, rating - 44) * 120 : 84;
    return [
      { kind: "long", years: Math.min(ageCap, 4), salary: Math.round(legacyBase * 0.92) },
      { kind: "short", years: Math.min(ageCap, 2), salary: Math.round(legacyBase * 1.12) },
    ];
  }
  const rule = LEAGUE_RULES[state.level];
  const positionMultiplier = state.positionSalaryBonusDisabled
    ? 1
    : POSITION_SALARY_MULTIPLIER[state.primaryPosition ?? "P"];
  const marketIndex = supportsFourPositions(state)
    ? 0.85 + worldRandom(state, `market-${rule.league}`, "index") * 0.3
    : 1;
  const base =
    (rule.baseSalary + Math.max(0, rating - rule.par) * Math.max(24, rule.baseSalary * 0.08)) *
    positionMultiplier;
  const offers: Array<{
    id: string;
    kind: "long" | "short" | "overseas";
    years: number;
    salary: number;
    level?: LeagueLevel;
    team?: string;
    source?: "posting" | "fa" | "free_agent" | "injury_replacement" | "tryout";
  }> = [
    {
      id: "long",
      kind: "long" as const,
      years: Math.min(ageCap, (state.positionGroup ?? "pitcher") === "pitcher" ? 4 : 8),
      salary: Math.round(base * marketIndex * 0.92),
    },
    {
      id: "short",
      kind: "short" as const,
      years: Math.min(ageCap, (state.positionGroup ?? "pitcher") === "pitcher" ? 2 : 4),
      salary: Math.round(base * marketIndex * 1.12),
    },
  ];
  if (!supportsExpandedCareer(state)) return offers;
  const candidates: LeagueLevel[] = ["abl"];
  if (rating >= 45) candidates.push("kbo2", "npb2");
  if (rating >= 52) candidates.push("kbo1", "npb1");
  if (rating >= 36) candidates.push("rookie");
  if (rating >= 40) candidates.push("a");
  if (rating >= 44) candidates.push("high_a");
  if (rating >= 48) candidates.push("aa");
  if (rating >= 54) candidates.push("aaa");
  if (rating >= 62) candidates.push("mlb");
  if (LEAGUE_RULES[state.level].league !== "cpbl") candidates.push("cpbl1");
  const levelCandidates = candidates.filter(
    (candidate) => LEAGUE_RULES[candidate].league !== rule.league,
  );
  const level = supportsFourPositions(state)
    ? worldPick(state, "fa-destination-level", levelCandidates)
    : pick(state, levelCandidates);
  const targetRule = LEAGUE_RULES[level];
  const team = supportsFourPositions(state)
    ? worldPick(state, `fa-destination-team-${targetRule.league}`, LEAGUE_TEAMS[targetRule.league])
    : pick(state, LEAGUE_TEAMS[targetRule.league]);
  const source =
    state.contract.serviceYears >= 7
      ? "fa"
      : rating >= 58 && state.contract.serviceYears >= 3
        ? "posting"
        : state.age >= 34
          ? "injury_replacement"
          : rating < 48
            ? "tryout"
            : "free_agent";
  offers.push({
    id: "overseas",
    kind: "overseas",
    years:
      source === "injury_replacement" || source === "tryout"
        ? 1
        : level === "abl"
          ? Math.min(2, ageCap)
          : Math.min(3, ageCap),
    salary: Math.round(targetRule.baseSalary * (rating >= targetRule.par + 6 ? 1.45 : 1)),
    level,
    team,
    source,
  });
  return offers;
}

const PROMOTION_LEVEL: Partial<Record<LeagueLevel, LeagueLevel>> = {
  cpbl2: "cpbl1",
  npb2: "npb1",
  rookie: "a",
  a: "high_a",
  high_a: "aa",
  aa: "aaa",
  aaa: "mlb",
  kbo2: "kbo1",
};
const DEMOTION_LEVEL: Partial<Record<LeagueLevel, LeagueLevel>> = {
  cpbl1: "cpbl2",
  npb1: "npb2",
  a: "rookie",
  high_a: "a",
  aa: "high_a",
  aaa: "aa",
  mlb: "aaa",
  kbo1: "kbo2",
};

function scoutingTierFor(market: ScoutingMarket, rating: number): ScoutingTier {
  const invitation = market === "cpbl" ? 46 : market === "npb" ? 41 : 37;
  if (rating >= invitation) return "invited";
  if (rating >= 40) return "cross_check";
  if (rating >= 32) return "watchlist";
  return "unseen";
}

function scoutingPerformance(stats: SeasonStats): number {
  if ("innings" in stats) {
    const strikeoutRate = stats.innings > 0 ? stats.strikeouts / stats.innings : 0;
    return clamp(Math.round((4.5 - stats.era) * 2 + (strikeoutRate - 0.7) * 5), -8, 10);
  }
  return clamp(Math.round((stats.ops - 0.65) * 24 + stats.defense / 5), -8, 10);
}

function scoutingTools(state: CareerState): { strength: AbilityKey; concern: AbilityKey } {
  const sorted = [...abilityKeys(state)].sort(
    (left, right) => (state.abilities[right] ?? 0) - (state.abilities[left] ?? 0),
  );
  return {
    strength: sorted[0] ?? "stamina",
    concern: sorted.at(-1) ?? "stamina",
  };
}

function mlbToolScore(state: CareerState): number {
  const tools =
    (state.positionGroup ?? "pitcher") === "pitcher"
      ? [state.abilities.velocity ?? 0, state.abilities.breaking ?? 0, state.abilities.control ?? 0]
      : [
          state.abilities.contact ?? 0,
          state.abilities.power ?? 0,
          state.abilities.speed ?? 0,
          state.abilities.arm ?? 0,
        ];
  return (
    tools
      .sort((left, right) => right - left)
      .slice(0, 2)
      .reduce((sum, value) => sum + value, 0) / 2
  );
}

function evaluateScouting(state: CareerState, events: string[]): void {
  if (!state.scouting || state.stage === "professional" || state.stage === "retired") return;
  const stats = state.seasons.at(-1);
  if (!stats || stats.year !== state.year) return;
  const performance = scoutingPerformance(stats);
  const awardExposure = stats.awards.length * 4;
  state.scouting.exposure = clamp(
    state.scouting.exposure + 5 + Math.max(0, performance) + awardExposure,
    0,
    100,
  );
  const injuryPenalty =
    stats.injured === "rehab"
      ? 10
      : stats.injured === "major"
        ? 8
        : stats.injured === "minor"
          ? 2
          : 0;
  const ageBonus = Math.max(0, 22 - state.age) * 0.45;
  const positionDemand =
    state.primaryPosition === "SS" || state.primaryPosition === "CF"
      ? 2
      : state.primaryPosition === "C"
        ? 1
        : 0;
  const noise =
    (keyedRandom(
      state.seed,
      state.engineVersion,
      SALARY_DUEL_RULESET_VERSION,
      state.positionGroup ?? "pitcher",
      state.year,
      "career",
      "scouting-evaluation",
      "error",
    ) -
      0.5) *
    4;
  const baseRating =
    overall(state) * 0.55 +
    (overall(state) + performance) * 0.3 +
    (overall(state) + ageBonus) * 0.1 +
    (overall(state) + positionDemand) * 0.05 -
    injuryPenalty +
    noise;
  const attendance: Record<ScoutingMarket, boolean> = {
    cpbl: true,
    npb: worldChance(state, "scout-attendance-npb", 48),
    mlb: worldChance(state, "scout-attendance-mlb", 30),
  };
  const { strength, concern } = scoutingTools(state);
  for (const market of ["cpbl", "npb", "mlb"] as const) {
    if (!attendance[market]) continue;
    const marketAdjustment = market === "cpbl" ? 0 : market === "npb" ? -5 : -9;
    const exposureWeight = market === "cpbl" ? 0.12 : market === "npb" ? 0.08 : 0.06;
    const rating = clamp(
      Math.round(baseRating + marketAdjustment + state.scouting.exposure * exposureWeight),
      0,
      100,
    );
    const current = state.scouting.markets[market];
    const rawCandidate = scoutingTierFor(market, rating);
    const candidate =
      market === "mlb" && rawCandidate === "invited" && (state.age > 23 || mlbToolScore(state) < 44)
        ? "cross_check"
        : rawCandidate;
    const tier =
      SCOUTING_TIER_ORDER.indexOf(candidate) > SCOUTING_TIER_ORDER.indexOf(current.tier)
        ? candidate
        : current.tier;
    current.internalRating = rating;
    current.lastEvaluatedYear = state.year;
    if (tier !== current.tier) {
      current.tier = tier;
      const marketLabel = market === "cpbl" ? "中職" : market === "npb" ? "日職" : "美職";
      const tierLabel = {
        unseen: "尚未進入名單",
        watchlist: "地區球探追蹤",
        cross_check: "球團交叉覆核",
        invited: "正式邀請",
      }[tier];
      const summary = `${marketLabel}評價升至「${tierLabel}」；優勢是${ABILITY_LABELS[strength]}，仍需改善${ABILITY_LABELS[concern]}。`;
      state.scouting.reports.push({
        year: state.year,
        market,
        tier,
        summary,
        strength,
        concern,
      });
      state.scouting.reports = state.scouting.reports.slice(-8);
      events.push(`球探報告｜${summary}`);
    }
  }
}

function amateurFallback(
  state: CareerState,
): "continue_school" | "join_amateur" | "remain_amateur" {
  if (state.stage === "high_school") return "continue_school";
  if (state.stage === "university" && state.stageYear < 4) return "continue_school";
  if (state.stage === "university") return "join_amateur";
  return "remain_amateur";
}

function setAmateurRouteDecision(state: CareerState): void {
  if (!state.scouting) throw new DomainError("球探狀態不存在");
  const eligible = state.scouting.draftEligibility !== "none";
  state.pending = {
    type: "draft",
    canEnterDraft: eligible,
    canContinueSchool:
      state.stage === "high_school" || (state.stage === "university" && state.stageYear < 4),
    canJoinAmateur:
      (state.stage === "university" && state.stageYear >= 4) || state.stage === "amateur_club",
    canRetire:
      (state.stage === "university" && state.stageYear >= 4) || state.stage === "amateur_club",
    schoolLabel:
      state.stage === "high_school"
        ? "university"
        : state.stage === "university" && state.stageYear < 4
          ? "remain_university"
          : null,
  };
}

function scoutingOffers(state: CareerState): ScoutOffer[] {
  if (!state.scouting) return [];
  const offers: ScoutOffer[] = [];
  const cpbl = state.scouting.markets.cpbl;
  if (state.scouting.draftAttempts >= 3 && cpbl.tier === "invited") {
    offers.push({
      id: `cpbl-direct-${state.year}`,
      kind: "cpbl_direct",
      label: "三次落選後自由協商",
      team: worldPick(state, "scout-cpbl-direct-team", LEAGUE_TEAMS.cpbl),
      level: "cpbl2",
      salary: 84,
      years: 1,
    });
  } else if (state.scouting.draftEligibility === "none") {
    if (cpbl.tier === "cross_check" || cpbl.tier === "invited")
      offers.push({
        id: `cpbl-recommendation-${state.year}`,
        kind: "cpbl_recommendation",
        label: `接受${state.stage === "high_school" ? "高中教練" : "球團"}推薦進入選秀`,
      });
    else if (cpbl.tier === "watchlist")
      offers.push({
        id: `cpbl-tryout-${state.year}`,
        kind: "cpbl_tryout",
        label: "參加新人測試會｜成功才可進入選秀",
      });
  }
  const npb = state.scouting.markets.npb;
  if (npb.tier === "invited") {
    offers.push({
      id: `npb-${state.year}`,
      kind: "npb_contract",
      label: "接受日職育成／二軍合約",
      team: worldPick(state, "scout-npb-team", LEAGUE_TEAMS.npb),
      level: "npb2",
      salary: 180,
      years: 2,
    });
  }
  const mlb = state.scouting.markets.mlb;
  if (mlb.tier === "invited" && state.age <= 23) {
    offers.push({
      id: `mlb-${state.year}`,
      kind: "mlb_contract",
      label: `接受美職${mlb.internalRating >= 64 ? "1A" : "新人聯盟"}合約`,
      team: worldPick(state, "scout-mlb-team", LEAGUE_TEAMS.mlb),
      level: mlb.internalRating >= 64 ? "a" : "rookie",
      salary: mlb.internalRating >= 64 ? 240 : 150,
      years: 3,
    });
  }
  return offers;
}

function prepareAmateurPostSeason(state: CareerState, events: string[]): void {
  evaluateScouting(state, events);
  if (state.stage === "high_school" && state.stageYear < 3) {
    advanceYear(state, events, true);
    return;
  }
  if (state.stage === "university" && state.stageYear === 1) {
    advanceYear(state, events, true);
    return;
  }
  if (state.stage === "amateur_club" && state.age >= 26) {
    retire(state, "26 歲仍未取得職業機會，轉任基層教練。", events);
    return;
  }
  const offers = scoutingOffers(state);
  if (offers.length > 0) {
    state.pending = { type: "scout_opportunity", offers, fallback: amateurFallback(state) };
    events.push(`球探機會｜收到 ${offers.length} 個已固定的測試或合約選項。`);
    return;
  }
  setAmateurRouteDecision(state);
}

function resolvePostSeason(state: CareerState, events: string[]): void {
  if (supportsFourPositions(state) && state.stage !== "professional") {
    prepareAmateurPostSeason(state, events);
    return;
  }
  if (state.stage === "high_school") {
    if (state.stageYear < 3) advanceYear(state, events, true);
    else state.pending = { type: "draft", canContinueSchool: true, schoolLabel: "university" };
    return;
  }
  if (state.stage === "university") {
    state.pending = {
      type: "draft",
      canContinueSchool: state.stageYear < 4,
      schoolLabel: state.stageYear < 4 ? "remain_university" : null,
    };
    return;
  }
  if (state.stage !== "professional") return;

  state.contract.serviceYears += 1;
  const seasonLevel = state.seasons.at(-1)?.level ?? state.level;
  if (supportsFourPositions(state) && ["cpbl1", "npb1", "mlb", "kbo1"].includes(seasonLevel))
    state.contract.topLevelServiceYears = (state.contract.topLevelServiceYears ?? 0) + 1;
  state.contract.yearsRemaining = Math.max(0, state.contract.yearsRemaining - 1);
  const rating = overall(state);
  const rule = LEAGUE_RULES[state.level];
  const promoted = PROMOTION_LEVEL[state.level];
  const demoted = DEMOTION_LEVEL[state.level];
  if (promoted && rule.promotionOverall !== null && rating >= rule.promotionOverall) {
    state.level = promoted;
    events.push(`升上一軍｜球團將你登錄至${LEVEL_LABELS[promoted]}。`);
  } else if (demoted && rule.demotionOverall !== null && rating < rule.demotionOverall) {
    state.level = demoted;
    events.push(`下放調整｜球團將你移至${LEVEL_LABELS[demoted]}重新找回狀態。`);
  }
  if (
    supportsExpandedCareer(state) &&
    state.level !== "abl" &&
    (supportsFourPositions(state) ? worldChance(state, "trade-window", 6) : chance(state, 6))
  ) {
    const league = LEAGUE_RULES[state.level].league;
    const destinations = LEAGUE_TEAMS[league].filter((team) => team !== state.team);
    if (destinations.length > 0) {
      const formerTeam = state.team;
      state.team = supportsFourPositions(state)
        ? worldPick(state, "trade-destination", destinations)
        : pick(state, destinations);
      events.push(`季後交易｜${formerTeam}將你交易至${state.team}，合約與聯盟年資延續。`);
    }
  }
  if (state.age >= LEAGUE_THRESHOLDS.forcedRetirementAge) {
    retire(state, "身體到達極限，48 歲強制引退。", events);
    return;
  }
  if (state.contract.yearsRemaining === 0) {
    if (
      supportsFourPositions(state) &&
      state.contract.clubControlled !== false &&
      (state.contract.topLevelServiceYears ?? 0) < 5
    ) {
      const short = contractOffers(state).find((offer) => offer.kind === "short");
      if (!short) throw new DomainError("無法產生母隊續約");
      state.contract.annualSalary = short.salary;
      state.contract.yearsRemaining = 1;
      state.positionSalaryBonusDisabled = false;
      events.push(
        `球團控制期續約｜頂級聯盟年資 ${state.contract.topLevelServiceYears ?? 0}/5，母隊自動以 1 年、年薪 ${short.salary} 萬續約。`,
      );
      advanceYear(state, events);
      return;
    }
    if (supportsFourPositions(state)) {
      const homeBaseSalary = Math.max(
        1,
        Math.round(
          (contractOffers(state).find((offer) => offer.kind === "short")?.salary ??
            state.contract.annualSalary) / 1.12,
        ),
      );
      state.pending = { type: "free_agency_decision", homeBaseSalary };
    } else state.pending = { type: "contract", offers: contractOffers(state) };
    return;
  }
  if (state.age >= 36) {
    state.pending = { type: "career" };
    return;
  }
  advanceYear(state, events);
}

function chooseFreeAgency(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_free_agency" }>,
  events: string[],
): void {
  const pending = state.pending;
  if (pending?.type === "free_agency_decision") {
    if (action.choice === "retire") {
      retire(state, "取得 FA 資格後決定高掛球鞋。", events);
      return;
    }
    if (action.choice === "home") {
      const offers = contractOffers(state).filter((offer) => offer.kind !== "overseas");
      state.pending = {
        type: "contract_terms",
        team: state.team,
        level: state.level,
        source: "home",
        offers,
      };
      return;
    }
    const marketOffers =
      overall(state) < LEAGUE_RULES[state.level].par - 3
        ? []
        : contractOffers(state).filter((offer) => offer.kind === "overseas");
    state.pending = {
      type: "free_agent_market",
      homeBaseSalary: pending.homeBaseSalary,
      offers: marketOffers,
      returnMultiplier: marketOffers.length > 0 ? 0.9 : 0.7,
    };
    events.push(
      `測試 FA 市場｜${marketOffers.length > 0 ? `收到 ${marketOffers.length} 份外隊報價` : "市場暫無外隊報價"}；報價已固定，不會因重整訊息而重抽。`,
    );
    return;
  }
  if (pending?.type !== "free_agent_market") throw new DomainError("目前沒有 FA 市場抉擇");
  if (action.choice === "retire") {
    retire(state, "測試 FA 市場後決定引退。", events);
    return;
  }
  if (action.choice === "home") {
    const salary = Math.round(pending.homeBaseSalary * pending.returnMultiplier);
    state.contract.annualSalary = salary;
    state.contract.yearsRemaining = 1;
    state.positionSalaryBonusDisabled = false;
    events.push(
      `回到母隊｜測試市場後以 1 年、年薪 ${salary} 萬回隊（母隊基準的 ${Math.round(pending.returnMultiplier * 100)}%）。`,
    );
    advanceYear(state, events);
    return;
  }
  throw new DomainError("請從市場報價或回母隊選項中選擇");
}

function signFirstProfessionalContract(
  state: CareerState,
  offer: Pick<ScoutOffer, "team" | "level" | "salary" | "years">,
  events: string[],
  message: string,
): void {
  if (!offer.team || !offer.level || !offer.salary || !offer.years)
    throw new DomainError("球探合約資料不完整");
  state.stage = "professional";
  state.stageYear = 1;
  state.team = offer.team;
  state.level = offer.level;
  state.contract = {
    annualSalary: offer.salary,
    yearsRemaining: offer.years,
    serviceYears: 0,
    totalEarnings: state.contract.totalEarnings,
    topLevelServiceYears: 0,
    clubControlled: true,
    peakAnnualSalary: 0,
  };
  events.push(message);
  advanceYear(state, events);
}

function chooseScoutOpportunity(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_scout_opportunity" }>,
  events: string[],
): void {
  if (state.pending?.type !== "scout_opportunity" || !state.scouting)
    throw new DomainError("目前沒有球探邀約");
  const pending = state.pending;
  if (action.choice === "decline") {
    events.push("婉拒球探機會｜保留原有升學或業餘路線，本年度邀約不再保留。");
    setAmateurRouteDecision(state);
    return;
  }
  const offer = pending.offers.find((candidate) => candidate.id === action.choice);
  if (!offer) throw new DomainError("找不到指定的球探邀約");
  if (offer.kind === "cpbl_tryout") {
    const score = state.scouting.markets.cpbl.internalRating;
    const successRate = clamp(35 + (score - 32) * 4, 25, 85);
    if (
      keyedChance(
        state,
        "choiceOutcome",
        `cpbl-tryout-${state.stage}-${state.stageYear}`,
        successRate,
      )
    ) {
      state.scouting.draftEligibility = "tryout";
      state.scouting.exposure = clamp(state.scouting.exposure + 8, 0, 100);
      events.push("新人測試會｜通過測試並取得本年度選秀資格；這不算一次選秀投入。");
    } else events.push("新人測試會｜本次未通過，測試失敗不計入選秀落選次數。");
    setAmateurRouteDecision(state);
    return;
  }
  if (offer.kind === "cpbl_recommendation") {
    state.scouting.draftEligibility =
      state.stage === "high_school" ? "coach_recommendation" : "club_recommendation";
    events.push(
      `接受推薦｜取得${state.stage === "high_school" ? "高中教練" : "球團"}推薦，進入本年度中職新人選秀名單。`,
    );
    setAmateurRouteDecision(state);
    return;
  }
  if (offer.kind === "cpbl_direct" && state.scouting.draftAttempts < 3)
    throw new DomainError("尚未累積三次選秀落選，不能與中職球團自由協商");
  const leagueLabel =
    offer.kind === "npb_contract" ? "日職" : offer.kind === "mlb_contract" ? "美職" : "中職";
  signFirstProfessionalContract(
    state,
    offer,
    events,
    `球探簽約｜接受${leagueLabel}${offer.team}提出的 ${offer.years} 年合約，年薪 ${offer.salary} 萬。`,
  );
}

function chooseDraft(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_draft" }>,
  events: string[],
): void {
  if (state.pending?.type !== "draft") throw new DomainError("目前不是生涯道路選擇階段");
  if (supportsFourPositions(state)) {
    if (!state.scouting) throw new DomainError("球探狀態不存在");
    if (action.choice === "retire") {
      if (!state.pending.canRetire) throw new DomainError("目前不能選擇引退");
      retire(state, "大學畢業後決定結束競技生涯。", events);
      return;
    }
    if (action.choice === "join_amateur") {
      if (!state.pending.canJoinAmateur) throw new DomainError("目前不能加入業餘成棒");
      if (state.stage === "amateur_club") {
        state.stageYear += 1;
        events.push(`留在業餘成棒｜續留${state.team}，等待下一年度職業機會。`);
      } else {
        state.stage = "amateur_club";
        state.stageYear = 1;
        state.team = worldPick(state, "amateur-club", AMATEUR_CLUBS);
        events.push(`加入業餘成棒｜加盟${state.team}，持續等待職業球探與選秀機會。`);
      }
      advanceYear(state, events);
      return;
    }
    if (action.choice === "continue_school") {
      if (!state.pending.canContinueSchool) throw new DomainError("目前已不能繼續升學或留校");
      if (state.stage === "high_school") {
        state.stage = "university";
        state.stageYear = 1;
        state.team = worldPick(state, "university-destination", UNIVERSITIES);
      } else state.stageYear += 1;
      events.push(`繼續升學｜加入或留在${state.team}，等待下一次選秀機會。`);
      advanceYear(state, events);
      return;
    }
    if (!state.pending.canEnterDraft || state.scouting.draftEligibility === "none")
      throw new DomainError("尚未取得本年度中職新人選秀資格");
    const latest = state.seasons.at(-1);
    const performance = latest ? scoutingPerformance(latest) : 0;
    const draftRating =
      overall(state) * 0.65 + state.scouting.markets.cpbl.internalRating * 0.35 + performance;
    const selected = keyedChance(
      state,
      "choiceOutcome",
      `cpbl-draft-${state.stage}-${state.stageYear}`,
      clamp(18 + (draftRating - 34) * 4.5, 5, 94),
    );
    if (!selected) {
      state.scouting.draftAttempts += 1;
      state.scouting.draftEligibility = "none";
      events.push(`選秀落選｜這是第 ${state.scouting.draftAttempts} 次實際投入選秀未獲指名。`);
      if (state.stage === "high_school") {
        state.stage = "university";
        state.stageYear = 1;
        state.team = worldPick(state, "undrafted-university", UNIVERSITIES);
        events.push(`升學磨練｜改赴${state.team}繼續成長。`);
        advanceYear(state, events);
      } else if (state.stage === "university" && state.stageYear < 4) {
        state.stageYear += 1;
        advanceYear(state, events);
      } else {
        if (state.stage === "university") {
          state.stage = "amateur_club";
          state.stageYear = 1;
          state.team = worldPick(state, "undrafted-amateur-club", AMATEUR_CLUBS);
          events.push(`轉戰業餘成棒｜加入${state.team}，不因大學畢業落選而被迫引退。`);
        } else state.stageYear += 1;
        advanceYear(state, events);
      }
      return;
    }
    const round = draftRating >= 56 ? 1 : draftRating >= 49 ? 2 : draftRating >= 43 ? 4 : 7;
    const level: LeagueLevel = overall(state) >= 41 ? "cpbl1" : "cpbl2";
    signFirstProfessionalContract(
      state,
      {
        team: worldPick(state, "cpbl-draft-team", LEAGUE_TEAMS.cpbl),
        level,
        salary: level === "cpbl1" ? 300 : 84,
        years: 2,
      },
      events,
      `選秀成功｜第 ${round} 輪獲球團指名，從${LEVEL_LABELS[level]}起步。`,
    );
    return;
  }
  if (action.choice === "continue_school") {
    if (!state.pending.canContinueSchool) throw new DomainError("目前已不能繼續留校");
    state.stage = "university";
    state.stageYear =
      state.stage === "university" && state.team.endsWith("大學") ? state.stageYear + 1 : 1;
    state.team = state.stageYear === 1 ? pick(state, UNIVERSITIES) : state.team;
    events.push(`繼續升學｜加入${state.team}，等待下一次選秀機會。`);
    advanceYear(state, events);
    return;
  }

  const rating = overall(state) + (state.age <= 18 ? 8 : 0);
  if (rating < 30) {
    if (state.stage === "high_school") {
      state.stage = "university";
      state.stageYear = 1;
      state.team = pick(state, UNIVERSITIES);
      events.push(`選秀落選｜改赴${state.team}繼續磨練。`);
      advanceYear(state, events);
    } else if (state.stageYear < 4) {
      events.push("選秀落選｜留在大學再拚一年。 ");
      advanceYear(state, events, true);
    } else retire(state, "大學畢業仍未獲職棒指名，結束競技生涯。", events);
    return;
  }

  const round =
    rating >= 56
      ? 1
      : rating >= 49
        ? 2
        : rating >= 43
          ? randomInt(state, 3, 4)
          : rating >= 37
            ? randomInt(state, 5, 7)
            : randomInt(state, 8, 10);
  state.stage = "professional";
  state.stageYear = 1;
  state.level = overall(state) >= 41 ? "cpbl1" : "cpbl2";
  state.team = pick(state, LEAGUE_TEAMS.cpbl);
  state.contract = {
    annualSalary: state.level === "cpbl1" ? 300 : 84,
    yearsRemaining: 2,
    serviceYears: 0,
    totalEarnings: state.contract.totalEarnings,
  };
  events.push(`選秀成功｜第 ${round} 輪獲${state.team}指名，從${LEVEL_LABELS[state.level]}起步。`);
  advanceYear(state, events);
}

function chooseTj(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_tj" }>,
  events: string[],
): void {
  if (state.pending?.type !== "tj") throw new DomainError("目前沒有 TJ 抉擇");
  state.abilities.velocity = clamp((state.abilities.velocity ?? 0) - 5, 1, 80);
  state.abilities.breaking = clamp((state.abilities.breaking ?? 0) - 5, 1, 80);
  state.injury.tjCount += 1;
  if (action.choice === "surgery") {
    state.injury.tjLoad = 0;
    state.injury.rehabSeasons = 1;
    const velocityRecovery = randomInt(state, 3, 10);
    const breakingRecovery = randomInt(state, 3, 10);
    state.abilities.velocity = clamp((state.abilities.velocity ?? 0) + velocityRecovery, 1, 80);
    state.abilities.breaking = clamp((state.abilities.breaking ?? 0) + breakingRecovery, 1, 80);
    state.counters.successfulInjections = 0;
    events.push(
      `TJ 手術｜隔年進入復健，球速回復 ${velocityRecovery}、變化球回復 ${breakingRecovery}。`,
    );
  } else {
    const successRate = state.traits.rubber_arm ? 85 : 55;
    if (chance(state, successRate)) {
      state.injury.tjLoad = Math.max(0, state.injury.tjLoad - 20);
      state.abilities.velocity = clamp((state.abilities.velocity ?? 0) + 5, 1, 80);
      state.abilities.breaking = clamp((state.abilities.breaking ?? 0) + 5, 1, 80);
      state.counters.successfulInjections += 1;
      events.push("打針硬撐成功｜TJ 負荷下降，球速與變化球各回升 5。 ");
      if (state.counters.successfulInjections >= TRAIT_THRESHOLDS.rubberArmInjections)
        unlockTrait(state, "rubber_arm", events);
    } else {
      state.injury.tjLoad = 0;
      state.injury.rehabSeasons = 1;
      state.counters.successfulInjections = 0;
      events.push("打針硬撐失敗｜韌帶斷裂，隔年全年復健。 ");
    }
  }
  if (state.injury.tjCount >= 2) {
    state.abilities.velocity = Math.max(1, Math.round((state.abilities.velocity ?? 0) / 2));
    state.abilities.breaking = Math.max(1, Math.round((state.abilities.breaking ?? 0) / 2));
    events.push("兩度 TJ 的代價｜球速與變化球折半。 ");
  }
  resolvePostSeason(state, events);
}

function chooseContract(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_contract" }>,
  events: string[],
): void {
  if (
    state.pending?.type !== "contract" &&
    state.pending?.type !== "contract_terms" &&
    state.pending?.type !== "free_agent_market"
  )
    throw new DomainError("目前沒有待選合約");
  if (action.choice === "retire") {
    retire(state, "合約期滿後決定高掛球鞋。", events);
    return;
  }
  const offer = state.pending.offers.find(
    (candidate) => candidate.id === action.choice || candidate.kind === action.choice,
  );
  if (!offer) throw new DomainError("找不到指定的合約");
  state.contract.annualSalary = offer.salary;
  state.contract.yearsRemaining = offer.years;
  state.positionSalaryBonusDisabled = false;
  if (offer.level && offer.team) {
    const formerLeague = LEAGUE_RULES[state.level].league;
    const from = `${state.team}／${LEVEL_LABELS[state.level]}`;
    state.level = offer.level;
    state.team = offer.team;
    if (supportsFourPositions(state) && LEAGUE_RULES[offer.level].league !== formerLeague) {
      state.contract.clubControlled = false;
      state.contract.topLevelServiceYears = 5;
    }
    const sourceLabel = {
      posting: "入札",
      fa: "FA",
      free_agent: "自由球員",
      injury_replacement: "短期傷兵替補",
      tryout: "測試合約",
    }[offer.source ?? "free_agent"];
    events.push(
      `跨聯盟轉隊｜透過${sourceLabel}離開${from}，加盟${offer.team}，從${LEVEL_LABELS[offer.level]}展開新挑戰。`,
    );
  }
  events.push(
    `完成簽約｜${offer.kind === "long" ? "長約" : offer.kind === "short" ? "短約" : offer.level && LEAGUE_RULES[offer.level].league === "cpbl" ? "返台合約" : "海外合約"}，${offer.years} 年、年薪 ${offer.salary} 萬。`,
  );
  if (state.age >= 36) state.pending = { type: "career" };
  else advanceYear(state, events);
}

function careerSummary(state: CareerState, ending: string): CareerSummary {
  const professionalSeasons = state.seasons.filter((season) => season.level !== "amateur");
  const primarySeasons = professionalSeasons.filter((season) => season.engagement !== "offseason");
  const pitcherSeasons = professionalSeasons.filter((season) => "innings" in season);
  const hitterSeasons = professionalSeasons.filter((season) => season.kind === "hitter");
  const bestEraValues = pitcherSeasons
    .filter((season) => season.innings >= 30)
    .map((season) => season.era);
  const hitterAtBats = hitterSeasons.reduce((sum, season) => sum + season.atBats, 0);
  const hitterHits = hitterSeasons.reduce((sum, season) => sum + season.hits, 0);
  const summary: CareerSummary = {
    name: state.name,
    finalAge: state.age,
    seasons: primarySeasons.length,
    careerWins: pitcherSeasons.reduce((sum, season) => sum + season.wins, 0),
    careerSaves: pitcherSeasons.reduce((sum, season) => sum + season.saves, 0),
    careerStrikeouts: pitcherSeasons.reduce((sum, season) => sum + season.strikeouts, 0),
    careerInnings: round1(pitcherSeasons.reduce((sum, season) => sum + season.innings, 0)),
    bestEra: bestEraValues.length > 0 ? Math.min(...bestEraValues) : null,
    totalEarnings: state.contract.totalEarnings,
    honors: [...state.honors],
    traits: (Object.entries(state.traits) as Array<[TraitKey, boolean]>)
      .filter(([, unlocked]) => unlocked)
      .map(([key]) => key),
    ending,
    seed: state.seed,
    engineVersion: state.engineVersion,
  };
  if (supportsFourPositions(state)) {
    summary.peakAnnualSalary = state.contract.peakAnnualSalary ?? state.contract.annualSalary;
    summary.lastAnnualSalary = state.contract.annualSalary;
    summary.positionGroup = state.positionGroup ?? "pitcher";
    if ((state.positionGroup ?? "pitcher") === "pitcher") summary.primaryPosition = "P";
    else {
      const positionGames = new Map<DefensivePosition, number>();
      for (const season of hitterSeasons)
        positionGames.set(
          season.position,
          (positionGames.get(season.position) ?? 0) + season.games,
        );
      summary.primaryPosition =
        [...positionGames.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
        state.primaryPosition ??
        "DH";
    }
    summary.finalTeam = state.team;
    summary.finalLeague = LEAGUE_RULES[state.level].league;
    if (state.scouting) {
      summary.highestScoutingTier =
        (["mlb", "npb", "cpbl"] as const)
          .map((market) => state.scouting?.markets[market].tier ?? "unseen")
          .sort(
            (left, right) => SCOUTING_TIER_ORDER.indexOf(right) - SCOUTING_TIER_ORDER.indexOf(left),
          )[0] ?? "unseen";
      summary.scoutingHighlights = state.scouting.reports
        .map((report) => `${report.year}｜${report.summary}`)
        .slice(-3);
    }
    const milestones: string[] = [];
    for (const season of primarySeasons) {
      const league = season.league ?? LEAGUE_RULES[season.level].league;
      const milestone = `${season.calendarYear ?? season.year}｜${season.team}・${league.toUpperCase()}`;
      if (milestones.at(-1)?.split("｜")[1] !== milestone.split("｜")[1])
        milestones.push(milestone);
    }
    summary.careerHighlights = [milestones[0], ...milestones.slice(1, -1), milestones.at(-1)]
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(-4);
    summary.careerGames = professionalSeasons.reduce((sum, season) => sum + season.games, 0);
    summary.careerHits = hitterHits;
    summary.careerHomeRuns = hitterSeasons.reduce((sum, season) => sum + season.homeRuns, 0);
    summary.careerRbis = hitterSeasons.reduce((sum, season) => sum + season.rbis, 0);
    summary.careerStolenBases = hitterSeasons.reduce((sum, season) => sum + season.stolenBases, 0);
    summary.careerAverage =
      hitterAtBats > 0 ? Math.round((hitterHits / hitterAtBats) * 1000) / 1000 : null;
    summary.careerOps =
      hitterSeasons.length > 0
        ? Math.round(
            (hitterSeasons.reduce((sum, season) => sum + season.ops * season.plateAppearances, 0) /
              Math.max(
                1,
                hitterSeasons.reduce((sum, season) => sum + season.plateAppearances, 0),
              )) *
              1000,
          ) / 1000
        : null;
  }
  if (supportsExpandedCareer(state)) {
    const totals = new Map<
      NonNullable<CareerSummary["leagueTotals"]>[number]["league"],
      NonNullable<CareerSummary["leagueTotals"]>[number]
    >();
    for (const season of professionalSeasons) {
      const league = season.league ?? LEAGUE_RULES[season.level].league;
      const current = totals.get(league) ?? {
        league,
        seasons: 0,
        games: 0,
        innings: 0,
        wins: 0,
        saves: 0,
        strikeouts: 0,
        plateAppearances: 0,
        hits: 0,
        homeRuns: 0,
        rbis: 0,
        stolenBases: 0,
      };
      current.seasons += 1;
      current.games += season.games;
      if ("innings" in season) {
        current.innings = round1(current.innings + season.innings);
        current.wins += season.wins;
        current.saves += season.saves;
        current.strikeouts += season.strikeouts;
      } else {
        current.plateAppearances = (current.plateAppearances ?? 0) + season.plateAppearances;
        current.hits = (current.hits ?? 0) + season.hits;
        current.homeRuns = (current.homeRuns ?? 0) + season.homeRuns;
        current.rbis = (current.rbis ?? 0) + season.rbis;
        current.stolenBases = (current.stolenBases ?? 0) + season.stolenBases;
      }
      totals.set(league, current);
    }
    summary.leagueTotals = [...totals.values()];
    if (state.life) {
      summary.family = {
        status: state.life.status,
        partner: state.life.partner,
        children: state.life.children,
      };
    }
  }
  return summary;
}

function retire(state: CareerState, ending: string, events: string[]): void {
  state.stage = "retired";
  state.pending = null;
  state.summary = careerSummary(state, ending);
  events.push(`生涯結束｜${ending}`);
}

function chooseCareer(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_career" }>,
  events: string[],
): void {
  if (state.pending?.type !== "career") throw new DomainError("目前沒有引退抉擇");
  if (action.choice === "retire") retire(state, `${state.age} 歲宣布引退。`, events);
  else {
    events.push("再戰一年｜決定繼續挑戰職棒。 ");
    advanceYear(state, events);
  }
}

export function reduceCareer(source: CareerState, action: GameAction): EngineResult {
  if (source.summary) throw new DomainError("這段生涯已經結束");
  const state = structuredClone(source);
  const events: string[] = [];
  switch (action.type) {
    case "allocate_training":
      allocateTraining(state, action, events);
      break;
    case "assign_training_die":
      assignTrainingDie(state, action, events);
      break;
    case "undo_training_die":
      undoTrainingDie(state, events);
      break;
    case "confirm_training":
      confirmTraining(state, events);
      break;
    case "choose_event":
      chooseEvent(state, action, events);
      break;
    case "choose_pitch_effort":
      choosePitchEffort(state, action, events);
      break;
    case "choose_draft":
      chooseDraft(state, action, events);
      break;
    case "choose_scout_opportunity":
      chooseScoutOpportunity(state, action, events);
      break;
    case "choose_tj":
      chooseTj(state, action, events);
      break;
    case "choose_contract":
      chooseContract(state, action, events);
      break;
    case "choose_free_agency":
      chooseFreeAgency(state, action, events);
      break;
    case "choose_life":
      chooseLife(state, action, events);
      break;
    case "choose_abl":
      chooseAbl(state, action, events);
      break;
    case "choose_international":
      chooseInternational(state, action, events);
      break;
    case "choose_career":
      chooseCareer(state, action, events);
      break;
    default:
      assertNever(action);
  }
  state.lastOutcome = events;
  const structuredEvents = events.map((message): EngineEvent => {
    const [rawTitle, ...rest] = message.split("｜");
    const title = rawTitle?.trim() || "生涯動態";
    const body = rest.join("｜").trim() || message.trim();
    const category = /傷|TJ|復健/.test(title)
      ? "injury"
      : /婚|家庭|緣分|分手|誘惑|赴約/.test(title)
        ? "life"
        : /合約|簽約|續約/.test(title)
          ? "contract"
          : /聯盟|澳職|國際|升上|下放|轉隊|選秀/.test(title)
            ? "league"
            : /球季|榮譽|獎/.test(title)
              ? "season"
              : /訓練|特訓|骰/.test(title)
                ? "training"
                : "career";
    const tone = /失敗|受傷|報銷|離婚|下降|下放|落選/.test(message)
      ? "bad"
      : /解鎖|榮譽|冠軍|成功|升上|完婚/.test(message)
        ? "good"
        : "neutral";
    return { year: source.year, age: source.age, category, tone, title, body };
  });
  const journalEvents = structuredEvents.filter(
    (event) => event.title !== "訓練骰暫存" && event.title !== "復原訓練骰",
  );
  if (state.engineVersion !== LEGACY_ENGINE_VERSION) {
    state.recentEvents = [...(source.recentEvents ?? []), ...journalEvents]
      .filter((event) => event.year === source.year)
      .slice(-3);
  }
  return { state, events: journalEvents };
}
