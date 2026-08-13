import { DomainError } from "./errors.ts";
import { chance, initialRngState, pick, random, randomInt } from "./rng.ts";
import {
  ABILITY_LABELS,
  abilityCost,
  CAREER_EVENTS,
  EFFORT_CONFIG,
  LEAGUE_RULES,
  LEAGUE_TEAMS,
  LEAGUE_THRESHOLDS,
  LEVEL_LABELS,
  overall,
  STRATEGY_CONFIG,
  TRAIT_THRESHOLDS,
} from "./rules.ts";
import {
  type AbilityKey,
  type AbilitySet,
  type CareerState,
  type CareerSummary,
  ENGINE_VERSION,
  type EngineEvent,
  type EngineResult,
  type GameAction,
  LEGACY_ENGINE_VERSION,
  type LeagueLevel,
  type SeasonStats,
  STATE_SCHEMA_VERSION,
  type TraitKey,
  UPSTREAM_COMMIT,
} from "./types.ts";

const ABILITY_KEYS: readonly AbilityKey[] = ["stamina", "velocity", "control", "breaking"];
const HIGH_SCHOOLS = ["平鎮高中", "穀保家商", "高苑工商", "北科附工", "普門高中", "東大體中"];
const UNIVERSITIES = ["北方大學", "府城大學", "海線體育大學", "首都科技大學"];

function supportsExpandedCareer(state: CareerState): boolean {
  return state.engineVersion === ENGINE_VERSION;
}

function emptyAbilities(): AbilitySet {
  return { stamina: 0, velocity: 0, control: 0, breaking: 0 };
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
  const signature = pick(state, ABILITY_KEYS);
  const potential = emptyAbilities();
  for (const key of ABILITY_KEYS) {
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
  if (state.stage === "professional") state.pending = { type: "pitch_effort" };
  else createTrainingDecision(state);
}

export function createCareerState(
  name: string,
  seed: string,
  engineVersion: string = ENGINE_VERSION,
): CareerState {
  const normalizedSeed = seed.trim().slice(0, 24) || "yakyulife";
  const state: CareerState = {
    schemaVersion: engineVersion === LEGACY_ENGINE_VERSION ? 1 : STATE_SCHEMA_VERSION,
    engineVersion,
    upstreamCommit: UPSTREAM_COMMIT,
    seed: normalizedSeed,
    rngState: initialRngState(normalizedSeed),
    name: name.trim().slice(0, 10) || "無名投手",
    age: 16,
    year: 2026,
    stage: "high_school",
    stageYear: 1,
    level: "amateur",
    team: "",
    role: "starter",
    abilities: {
      stamina: 24,
      velocity: 28,
      control: 24,
      breaking: 24,
    },
    potential: emptyAbilities(),
    trainingCarry: emptyAbilities(),
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
    lastOutcome: ["球員誕生｜從高中一年級展開投手生涯。"],
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
        body: "從高中一年級展開投手生涯。",
      },
    ];
  }
  for (const key of ABILITY_KEYS)
    state.abilities[key] += randomInt(state, 0, key === "velocity" ? 7 : 5);
  state.potential = rollPotential(state);
  state.team = pick(state, HIGH_SCHOOLS);
  beginYear(state);
  return state;
}

function spendTrainingPoints(state: CareerState, key: AbilityKey, points: number): number {
  let remaining = points;
  let gained = 0;
  while (remaining > 0 && state.abilities[key] < 80) {
    const cost = abilityCost(state, key);
    const needed = cost - state.trainingCarry[key];
    const spent = Math.min(remaining, needed);
    state.trainingCarry[key] += spent;
    remaining -= spent;
    if (state.trainingCarry[key] >= cost) {
      state.trainingCarry[key] = 0;
      state.abilities[key] += 1;
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
    const event = pick(state, CAREER_EVENTS);
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
    preview.abilities[action.ability] >= 80 &&
    !ABILITY_KEYS.every((key) => preview.abilities[key] >= 80)
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
    gains: {
      stamina: copy.abilities.stamina - before.stamina,
      velocity: copy.abilities.velocity - before.velocity,
      control: copy.abilities.control - before.control,
      breaking: copy.abilities.breaking - before.breaking,
    },
  };
}

function confirmTraining(state: CareerState, events: string[]): void {
  const pending = trainingDecision(state);
  const assignments = pending.assignments ?? [];
  const allCapped = ABILITY_KEYS.every((key) => trainingPreview(state).abilities[key] >= 80);
  if (assignments.length < pending.dice.length && !allCapped)
    throw new DomainError("請先分配所有訓練骰");
  const gains = emptyAbilities();
  const spent = emptyAbilities();
  for (const [index, ability] of assignments.entries()) {
    const points = pending.dice[index] ?? 0;
    spent[ability] += points;
    gains[ability] += spendTrainingPoints(state, ability, points);
  }
  const details = ABILITY_KEYS.filter((key) => spent[key] > 0)
    .map((key) => `${ABILITY_LABELS[key]} ${spent[key]} 點（能力 +${gains[key]}）`)
    .join("、");
  events.push(`季初特訓｜逐骰分配完成：${details || "能力已滿，剩餘骰子捨棄"}。`);
  if (state.injury.rehabSeasons > 0) finishSeason(state, events, "rehab");
  else {
    const event = pick(state, CAREER_EVENTS);
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
  const rule = CAREER_EVENTS.find((event) => event.id === eventId);
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
  const config = STRATEGY_CONFIG[action.strategy];
  let successChance = config.successChance;
  if (action.strategy === "bold" && state.traits.clutch) successChance = 50;
  const success = chance(state, successChance);
  const delta = success ? config.magnitude : -config.magnitude;
  state.abilities[rule.ability] = clamp(state.abilities[rule.ability] + delta, 1, 80);

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
    `${rule.title}｜${config.label}${success ? "成功" : "失敗"}，${ABILITY_LABELS[rule.ability]} ${delta > 0 ? "+" : ""}${delta}。`,
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
  if (!chance(state, risk)) return "none";
  return chance(state, 24) ? "major" : "minor";
}

function currentLevelConfig(level: LeagueLevel): { games: number; par: number } {
  const rule = LEAGUE_RULES[level];
  return { games: rule.games, par: rule.par };
}

function simulateSeason(
  state: CareerState,
  injury: "none" | "minor" | "major" | "rehab",
): SeasonStats {
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
  const games = Math.round(Math.min(config.games, gamesBase) * seasonFactor);
  const starts = role === "starter" ? games : 0;
  const inningsPerGame = role === "starter" ? 5.2 + clamp(difference, -8, 12) * 0.08 : 1.05;
  const innings = round1(Math.max(0, games * inningsPerGame));
  const era = innings === 0 ? 0 : round1(clamp(4.6 - difference * 0.13 + noise, 1.2, 9.9));
  const strikeoutRate = clamp(
    5.2 + (state.abilities.velocity + state.abilities.breaking - 80) * 0.1,
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
  for (const key of ABILITY_KEYS) state.abilities[key] = clamp(state.abilities[key] - loss, 1, 80);
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
    for (const key of ABILITY_KEYS) state.abilities[key] = clamp(state.abilities[key] - 5, 1, 80);
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
  state.seasons.push(stats);
  state.honors.push(...stats.awards.map((award) => `${state.year} ${award}`));
  if (state.stage === "professional") {
    state.contract.totalEarnings += state.contract.annualSalary;
    const tjBase =
      ((state.abilities.velocity + state.abilities.breaking) / 19) *
      EFFORT_CONFIG[state.pitchEffort].tjMultiplier;
    state.injury.tjLoad += tjBase * (state.injury.tjCount > 0 ? 1.15 : 1);
  }
  if (injury !== "major" && injury !== "rehab") {
    events.push(
      `${state.year} 球季｜${LEVEL_LABELS[state.level]} ${stats.games} 場、${stats.innings} 局、${stats.wins} 勝、${stats.saves} 救援、ERA ${stats.era.toFixed(1)}。`,
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
    for (const key of ABILITY_KEYS) {
      state.potential[key] = clamp(state.potential[key] + 8, 1, 80);
      state.abilities[key] = clamp(state.abilities[key] + 3, 1, 80);
    }
  }

  if (forced === "rehab") state.injury.rehabSeasons = Math.max(0, state.injury.rehabSeasons - 1);
  const tjCap = state.traits.rubber_arm ? 100 : 50;
  if (state.stage === "professional" && state.injury.tjLoad >= tjCap)
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
  if (
    supportsExpandedCareer(state) &&
    state.stage === "professional" &&
    (classic || premier) &&
    overall(state) >= 50 &&
    state.injury.rehabSeasons === 0
  ) {
    state.pending = {
      type: "international",
      tournament: classic ? "世界棒球經典賽" : "世界12強賽",
      forced: state.age < 25,
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
    chance(state, 18)
  ) {
    state.pending = { type: "abl", team: pick(state, LEAGUE_TEAMS.abl), mode: "offseason" };
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
        state.abilities.control = clamp(state.abilities.control - 3, 1, 80);
        events.push("婚姻危機｜外遇曝光並以離婚收場，控球 -3。");
      } else {
        state.abilities.stamina = clamp(state.abilities.stamina + 1, 1, 80);
        events.push("危險赴約｜暫時沒有曝光，但這個選擇已留在生涯紀錄中，體力 +1。");
      }
    } else {
      state.abilities.control = clamp(state.abilities.control + 1, 1, 80);
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
      state.abilities.velocity = clamp(state.abilities.velocity + 1, 1, 80);
      events.push("加練優先｜錯過家庭時光換來訓練成果，球速 +1。");
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
  const stats = simulateSeason(state, "none");
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
      `國際賽徵召｜披上中華隊戰袍參加${invitation.tournament}，${stats.games} 場、${stats.innings} 局、${stats.strikeouts} K；結果記入生涯並增加下季疲勞。`,
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
      const key = pick(state, ABILITY_KEYS);
      state.abilities[key] = clamp(state.abilities[key] + 1, 1, 80);
      events.push(
        `澳職派遣｜效力${invitation.team}，${stats.games} 場、${stats.innings} 局、ERA ${stats.era.toFixed(1)}；${ABILITY_LABELS[key]} +1，但下季疲勞上升。`,
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
  const ageCap = state.age >= 36 ? 2 : state.age >= 34 ? 3 : state.age >= 32 ? 5 : 7;
  if (state.engineVersion === LEGACY_ENGINE_VERSION) {
    const legacyBase = state.level === "cpbl1" ? 300 + Math.max(0, rating - 44) * 120 : 84;
    return [
      { kind: "long", years: Math.min(ageCap, 4), salary: Math.round(legacyBase * 0.92) },
      { kind: "short", years: Math.min(ageCap, 2), salary: Math.round(legacyBase * 1.12) },
    ];
  }
  const rule = LEAGUE_RULES[state.level];
  const base =
    rule.baseSalary + Math.max(0, rating - rule.par) * Math.max(24, rule.baseSalary * 0.08);
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
      years: Math.min(ageCap, 4),
      salary: Math.round(base * 0.92),
    },
    {
      id: "short",
      kind: "short" as const,
      years: Math.min(ageCap, 2),
      salary: Math.round(base * 1.12),
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
  const level = pick(
    state,
    candidates.filter((candidate) => LEAGUE_RULES[candidate].league !== rule.league),
  );
  const targetRule = LEAGUE_RULES[level];
  const team = pick(state, LEAGUE_TEAMS[targetRule.league]);
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

function resolvePostSeason(state: CareerState, events: string[]): void {
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
  if (supportsExpandedCareer(state) && state.level !== "abl" && chance(state, 6)) {
    const league = LEAGUE_RULES[state.level].league;
    const destinations = LEAGUE_TEAMS[league].filter((team) => team !== state.team);
    if (destinations.length > 0) {
      const formerTeam = state.team;
      state.team = pick(state, destinations);
      events.push(`季後交易｜${formerTeam}將你交易至${state.team}，合約與聯盟年資延續。`);
    }
  }
  if (state.age >= LEAGUE_THRESHOLDS.forcedRetirementAge) {
    retire(state, "身體到達極限，48 歲強制引退。", events);
    return;
  }
  if (state.contract.yearsRemaining === 0) {
    state.pending = { type: "contract", offers: contractOffers(state) };
    return;
  }
  if (state.age >= 36) {
    state.pending = { type: "career" };
    return;
  }
  advanceYear(state, events);
}

function chooseDraft(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_draft" }>,
  events: string[],
): void {
  if (state.pending?.type !== "draft") throw new DomainError("目前不是生涯道路選擇階段");
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
  state.abilities.velocity = clamp(state.abilities.velocity - 5, 1, 80);
  state.abilities.breaking = clamp(state.abilities.breaking - 5, 1, 80);
  state.injury.tjCount += 1;
  if (action.choice === "surgery") {
    state.injury.tjLoad = 0;
    state.injury.rehabSeasons = 1;
    const velocityRecovery = randomInt(state, 3, 10);
    const breakingRecovery = randomInt(state, 3, 10);
    state.abilities.velocity = clamp(state.abilities.velocity + velocityRecovery, 1, 80);
    state.abilities.breaking = clamp(state.abilities.breaking + breakingRecovery, 1, 80);
    state.counters.successfulInjections = 0;
    events.push(
      `TJ 手術｜隔年進入復健，球速回復 ${velocityRecovery}、變化球回復 ${breakingRecovery}。`,
    );
  } else {
    const successRate = state.traits.rubber_arm ? 85 : 55;
    if (chance(state, successRate)) {
      state.injury.tjLoad = Math.max(0, state.injury.tjLoad - 20);
      state.abilities.velocity = clamp(state.abilities.velocity + 5, 1, 80);
      state.abilities.breaking = clamp(state.abilities.breaking + 5, 1, 80);
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
    state.abilities.velocity = Math.max(1, Math.round(state.abilities.velocity / 2));
    state.abilities.breaking = Math.max(1, Math.round(state.abilities.breaking / 2));
    events.push("兩度 TJ 的代價｜球速與變化球折半。 ");
  }
  resolvePostSeason(state, events);
}

function chooseContract(
  state: CareerState,
  action: Extract<GameAction, { type: "choose_contract" }>,
  events: string[],
): void {
  if (state.pending?.type !== "contract") throw new DomainError("目前沒有待選合約");
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
  if (offer.level && offer.team) {
    const from = `${state.team}／${LEVEL_LABELS[state.level]}`;
    state.level = offer.level;
    state.team = offer.team;
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
  const bestEraValues = professionalSeasons
    .filter((season) => season.innings >= 30)
    .map((season) => season.era);
  const summary: CareerSummary = {
    name: state.name,
    finalAge: state.age,
    seasons: primarySeasons.length,
    careerWins: professionalSeasons.reduce((sum, season) => sum + season.wins, 0),
    careerSaves: professionalSeasons.reduce((sum, season) => sum + season.saves, 0),
    careerStrikeouts: professionalSeasons.reduce((sum, season) => sum + season.strikeouts, 0),
    careerInnings: round1(professionalSeasons.reduce((sum, season) => sum + season.innings, 0)),
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
      };
      current.seasons += 1;
      current.games += season.games;
      current.innings = round1(current.innings + season.innings);
      current.wins += season.wins;
      current.saves += season.saves;
      current.strikeouts += season.strikeouts;
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
    case "choose_tj":
      chooseTj(state, action, events);
      break;
    case "choose_contract":
      chooseContract(state, action, events);
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
