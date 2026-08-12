export const ENGINE_VERSION = "0.1.0";
export const UPSTREAM_COMMIT = "913cad27db86bda79cbd53dc5666ab15d28c5d2d";
export const STATE_SCHEMA_VERSION = 1;

export type AbilityKey = "stamina" | "velocity" | "control" | "breaking";
export type Stage = "high_school" | "university" | "professional" | "retired";
export type LeagueLevel = "amateur" | "cpbl2" | "cpbl1";
export type PitcherRole = "starter" | "reliever" | "closer";
export type PitchEffort = "full" | "normal" | "easy";
export type EventStrategy = "safe" | "normal" | "bold";
export type PlayMode = "dm" | "channel";
export type CareerStatus = "active" | "completed" | "abandoned";

export type TraitKey =
  | "genius"
  | "fragile"
  | "iron_man"
  | "late_bloomer"
  | "disciplined"
  | "clutch"
  | "rubber_arm";

export interface AbilitySet {
  stamina: number;
  velocity: number;
  control: number;
  breaking: number;
}

export interface TraitSet {
  genius: boolean;
  fragile: boolean;
  iron_man: boolean;
  late_bloomer: boolean;
  disciplined: boolean;
  clutch: boolean;
  rubber_arm: boolean;
}

export interface SeasonStats {
  year: number;
  age: number;
  level: LeagueLevel;
  team: string;
  role: PitcherRole;
  games: number;
  starts: number;
  wins: number;
  losses: number;
  saves: number;
  holds: number;
  innings: number;
  strikeouts: number;
  earnedRuns: number;
  era: number;
  whip: number;
  injured: "none" | "minor" | "major" | "rehab";
  awards: string[];
}

export interface CareerCounters {
  sixesBefore22: number;
  conservativeChoices: number;
  boldSuccesses: number;
  majorInjuries: number;
  healthySeasons: number;
  successfulInjections: number;
}

export interface CareerContract {
  annualSalary: number;
  yearsRemaining: number;
  serviceYears: number;
  totalEarnings: number;
}

export interface InjuryState {
  rehabSeasons: number;
  temporaryPenalty: number;
  tjLoad: number;
  tjCount: number;
}

export interface CareerSummary {
  name: string;
  finalAge: number;
  seasons: number;
  careerWins: number;
  careerSaves: number;
  careerStrikeouts: number;
  careerInnings: number;
  bestEra: number | null;
  totalEarnings: number;
  honors: string[];
  traits: TraitKey[];
  ending: string;
  seed: string;
  engineVersion: string;
}

export interface TrainingDecision {
  type: "training";
  points: number;
  dice: number[];
}

export interface EventDecision {
  type: "event";
  eventId: string;
}

export interface EffortDecision {
  type: "pitch_effort";
}

export interface DraftDecision {
  type: "draft";
  canContinueSchool: boolean;
  schoolLabel: "university" | "remain_university" | null;
}

export interface TjDecision {
  type: "tj";
}

export interface ContractDecision {
  type: "contract";
  offers: Array<{ kind: "long" | "short"; years: number; salary: number }>;
}

export interface CareerDecision {
  type: "career";
}

export type PendingDecision =
  | TrainingDecision
  | EventDecision
  | EffortDecision
  | DraftDecision
  | TjDecision
  | ContractDecision
  | CareerDecision;

export interface CareerState {
  schemaVersion: number;
  engineVersion: string;
  upstreamCommit: string;
  seed: string;
  rngState: number;
  name: string;
  age: number;
  year: number;
  stage: Stage;
  stageYear: number;
  level: LeagueLevel;
  team: string;
  role: PitcherRole;
  abilities: AbilitySet;
  potential: AbilitySet;
  trainingCarry: AbilitySet;
  traits: TraitSet;
  counters: CareerCounters;
  contract: CareerContract;
  injury: InjuryState;
  pitchEffort: PitchEffort;
  seasons: SeasonStats[];
  honors: string[];
  pending: PendingDecision | null;
  lastOutcome: string[];
  summary: CareerSummary | null;
}

export type GameAction =
  | { type: "allocate_training"; primary: AbilityKey; secondary: AbilityKey }
  | { type: "choose_event"; strategy: EventStrategy }
  | { type: "choose_pitch_effort"; effort: PitchEffort }
  | { type: "choose_draft"; choice: "draft" | "continue_school" }
  | { type: "choose_tj"; choice: "surgery" | "injection" }
  | { type: "choose_contract"; choice: "long" | "short" | "retire" }
  | { type: "choose_career"; choice: "continue" | "retire" };

export interface EngineResult {
  state: CareerState;
  events: string[];
}

export interface CareerLocation {
  guildId: string | null;
  channelId: string | null;
  messageId: string | null;
}

export interface CareerRecord {
  id: string;
  discordUserId: string;
  status: CareerStatus;
  playMode: PlayMode;
  location: CareerLocation;
  seed: string;
  engineVersion: string;
  upstreamCommit: string;
  stateRevision: number;
  state: CareerState;
  summary: CareerSummary | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface NewCareerInput {
  discordUserId: string;
  name: string;
  seed: string;
  playMode: PlayMode;
  location: CareerLocation;
}

export interface CommitActionInput {
  careerId: string;
  discordUserId: string;
  interactionId: string;
  expectedRevision: number;
  action: GameAction;
}

export type CommitActionResult =
  | { status: "applied"; career: CareerRecord; events: string[] }
  | { status: "duplicate"; career: CareerRecord }
  | { status: "stale"; career: CareerRecord }
  | { status: "inactive"; career: CareerRecord }
  | { status: "not_found" }
  | { status: "forbidden" };
