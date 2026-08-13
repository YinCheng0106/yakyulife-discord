export const LEGACY_ENGINE_VERSION = "0.1.0";
export const CORE_ENGINE_VERSION = "0.2.0";
export const ENGINE_VERSION = "0.3.0";
export const UPSTREAM_COMMIT = "913cad27db86bda79cbd53dc5666ab15d28c5d2d";
export const STATE_SCHEMA_VERSION = 3;

export type AbilityKey = "stamina" | "velocity" | "control" | "breaking";
export type Stage = "high_school" | "university" | "professional" | "retired";
export type LeagueLevel =
  | "amateur"
  | "cpbl2"
  | "cpbl1"
  | "npb2"
  | "npb1"
  | "rookie"
  | "a"
  | "high_a"
  | "aa"
  | "aaa"
  | "mlb"
  | "kbo2"
  | "kbo1"
  | "abl"
  | "international";
export type LeagueKey = "amateur" | "cpbl" | "npb" | "mlb" | "kbo" | "abl" | "international";
export type SeasonEngagement = "primary" | "offseason";
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
  seasonId?: string;
  calendarYear?: number;
  seasonLabel?: string;
  league?: LeagueKey;
  engagement?: SeasonEngagement;
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

export type EventCategory =
  | "career"
  | "training"
  | "season"
  | "injury"
  | "contract"
  | "league"
  | "award"
  | "life";
export type EventTone = "neutral" | "good" | "bad" | "gold";

export interface EngineEvent {
  year: number;
  age: number;
  category: EventCategory;
  tone: EventTone;
  title: string;
  body: string;
}

export interface CareerJournalEntry extends EngineEvent {
  careerId: string;
  stateRevision: number;
  ordinal: number;
  createdAt: Date;
}

export interface CareerListItem {
  id: string;
  name: string;
  status: CareerStatus;
  startYear: number;
  endYear: number;
  updatedAt: Date;
}

export interface CareerHistory {
  career: CareerRecord;
  entries: CareerJournalEntry[];
  years: number[];
}

export interface LifeState {
  status: "single" | "dating" | "married" | "divorced";
  partner: string | null;
  datingYears: number;
  marriedYears: number;
  children: number;
  formerPartners: string[];
  affairs: number;
  caughtAffairs: number;
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
  leagueTotals?: Array<{
    league: LeagueKey;
    seasons: number;
    games: number;
    innings: number;
    wins: number;
    saves: number;
    strikeouts: number;
  }>;
  family?: {
    status: LifeState["status"];
    partner: string | null;
    children: number;
  };
}

export interface TrainingDecision {
  type: "training";
  /** Legacy 0.1.0 pooled allocation. */
  points?: number;
  dice: number[];
  /** 0.2.0+ assigns each die independently and applies only on confirmation. */
  assignments?: AbilityKey[];
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
  offers: Array<{
    id?: string;
    kind: "long" | "short" | "overseas";
    years: number;
    salary: number;
    level?: LeagueLevel;
    team?: string;
    source?: "posting" | "fa" | "free_agent" | "injury_replacement" | "tryout";
  }>;
}

export interface CareerDecision {
  type: "career";
}

export interface LifeDecision {
  type: "life";
  eventId: "dating" | "proposal" | "anniversary" | "temptation" | "reconcile";
}

export interface AblDecision {
  type: "abl";
  team: string;
  mode: "offseason" | "contract";
}

export interface InternationalDecision {
  type: "international";
  tournament: "世界棒球經典賽" | "世界12強賽";
  forced: boolean;
}

export type PendingDecision =
  | TrainingDecision
  | EventDecision
  | EffortDecision
  | DraftDecision
  | TjDecision
  | ContractDecision
  | CareerDecision
  | LifeDecision
  | AblDecision
  | InternationalDecision;

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
  life?: LifeState;
  offseasonFatigue?: number;
  pitchEffort: PitchEffort;
  seasons: SeasonStats[];
  honors: string[];
  pending: PendingDecision | null;
  lastOutcome: string[];
  recentEvents?: EngineEvent[];
  summary: CareerSummary | null;
}

export type GameAction =
  | { type: "allocate_training"; primary: AbilityKey; secondary: AbilityKey }
  | { type: "assign_training_die"; ability: AbilityKey }
  | { type: "undo_training_die" }
  | { type: "confirm_training" }
  | { type: "choose_event"; strategy: EventStrategy }
  | { type: "choose_pitch_effort"; effort: PitchEffort }
  | { type: "choose_draft"; choice: "draft" | "continue_school" }
  | { type: "choose_tj"; choice: "surgery" | "injection" }
  | { type: "choose_contract"; choice: string }
  | { type: "choose_life"; choice: "accept" | "decline" | "bold" }
  | { type: "choose_abl"; choice: "accept" | "decline" }
  | { type: "choose_international"; choice: "accept" | "decline" }
  | { type: "choose_career"; choice: "continue" | "retire" };

export interface EngineResult {
  state: CareerState;
  events: EngineEvent[];
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
  | { status: "applied"; career: CareerRecord; events: EngineEvent[] }
  | { status: "duplicate"; career: CareerRecord }
  | { status: "stale"; career: CareerRecord }
  | { status: "inactive"; career: CareerRecord }
  | { status: "not_found" }
  | { status: "forbidden" };
