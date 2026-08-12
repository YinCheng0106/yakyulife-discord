import { DomainError } from "./errors.ts";
import { chance, initialRngState, pick, random, randomInt } from "./rng.ts";
import {
  ABILITY_LABELS,
  abilityCost,
  CAREER_EVENTS,
  EFFORT_CONFIG,
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
  type EngineResult,
  type GameAction,
  type LeagueLevel,
  type SeasonStats,
  STATE_SCHEMA_VERSION,
  type TraitKey,
  UPSTREAM_COMMIT,
} from "./types.ts";

const ABILITY_KEYS: readonly AbilityKey[] = ["stamina", "velocity", "control", "breaking"];
const CPBL_TEAMS = ["台中猛瑪", "府城雄獅", "桃園金剛", "新北騎士", "台北恐龍", "高雄神鵰"];
const HIGH_SCHOOLS = ["平鎮高中", "穀保家商", "高苑工商", "北科附工", "普門高中", "東大體中"];
const UNIVERSITIES = ["北方大學", "府城大學", "海線體育大學", "首都科技大學"];

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
  state.pending = { type: "training", points: dice.reduce((sum, die) => sum + die, 0), dice };
}

function beginYear(state: CareerState): void {
  if (state.stage === "retired") return;
  if (state.stage === "professional") state.pending = { type: "pitch_effort" };
  else createTrainingDecision(state);
}

export function createCareerState(name: string, seed: string): CareerState {
  const normalizedSeed = seed.trim().slice(0, 24) || "yakyulife";
  const state: CareerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
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
  const points = state.pending.points;
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
  const risk = clamp(24 + ageRisk + traitRisk + state.injury.temporaryPenalty, 4, 80);
  state.injury.temporaryPenalty = 0;
  if (!chance(state, risk)) return "none";
  return chance(state, 24) ? "major" : "minor";
}

function currentLevelConfig(level: LeagueLevel): { games: number; par: number } {
  if (level === "cpbl1") return { games: 120, par: 44 };
  if (level === "cpbl2") return { games: 80, par: 34 };
  return { games: 30, par: 32 };
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
  if (state.level === "cpbl1" && difference >= 8 && innings >= 80) awards.push("年度最佳投手");
  if (state.level === "cpbl1" && strikeouts >= 150) awards.push("三振王");
  if (state.level === "cpbl1" && saves >= 30) awards.push("救援王");
  if (state.level === "cpbl1" && difference >= 4) awards.push("明星賽");
  return {
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
  if (injury === "major") {
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
  events.push(
    `${state.year} 球季｜${LEVEL_LABELS[state.level]} ${stats.games} 場、${stats.innings} 局、${stats.wins} 勝、${stats.saves} 救援、ERA ${stats.era.toFixed(1)}。`,
  );
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
  else resolvePostSeason(state, events);
}

function advanceYear(state: CareerState, events: string[], incrementStageYear = false): void {
  state.year += 1;
  state.age += 1;
  if (incrementStageYear) state.stageYear += 1;
  applyAging(state, events);
  beginYear(state);
}

function contractOffers(
  state: CareerState,
): Array<{ kind: "long" | "short"; years: number; salary: number }> {
  const rating = overall(state);
  const base = state.level === "cpbl1" ? 300 + Math.max(0, rating - 44) * 120 : 84;
  const ageCap = state.age >= 36 ? 2 : state.age >= 34 ? 3 : state.age >= 32 ? 5 : 7;
  return [
    { kind: "long", years: Math.min(ageCap, 4), salary: Math.round(base * 0.92) },
    { kind: "short", years: Math.min(ageCap, 2), salary: Math.round(base * 1.12) },
  ];
}

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
  if (state.level === "cpbl2" && rating >= LEAGUE_THRESHOLDS.cpbl1PromotionOverall) {
    state.level = "cpbl1";
    events.push("升上一軍｜球團將你登錄至中職一軍。 ");
  } else if (state.level === "cpbl1" && rating < LEAGUE_THRESHOLDS.cpbl2DemotionOverall) {
    state.level = "cpbl2";
    events.push("下放二軍｜球團要求你重新找回狀態。 ");
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
  state.team = pick(state, CPBL_TEAMS);
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
  const offer = state.pending.offers.find((candidate) => candidate.kind === action.choice);
  if (!offer) throw new DomainError("找不到指定的合約");
  state.contract.annualSalary = offer.salary;
  state.contract.yearsRemaining = offer.years;
  events.push(
    `完成續約｜選擇${action.choice === "long" ? "長約" : "短約"}，${offer.years} 年、年薪 ${offer.salary} 萬。`,
  );
  if (state.age >= 36) state.pending = { type: "career" };
  else advanceYear(state, events);
}

function careerSummary(state: CareerState, ending: string): CareerSummary {
  const professionalSeasons = state.seasons.filter((season) => season.level !== "amateur");
  const bestEraValues = professionalSeasons
    .filter((season) => season.innings >= 30)
    .map((season) => season.era);
  return {
    name: state.name,
    finalAge: state.age,
    seasons: professionalSeasons.length,
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
    case "choose_career":
      chooseCareer(state, action, events);
      break;
    default:
      assertNever(action);
  }
  state.lastOutcome = events;
  return { state, events };
}
