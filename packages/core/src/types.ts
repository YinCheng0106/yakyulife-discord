export const LEGACY_ENGINE_VERSION = "0.1.0";
export const CORE_ENGINE_VERSION = "0.2.0";
export const MULTI_LEAGUE_ENGINE_VERSION = "0.3.0";
export const FOUR_POSITION_ENGINE_VERSION = "0.4.0";
export const ENGINE_VERSION = "0.5.0";
export const UPSTREAM_COMMIT = "d3880c2996e7b418e2a3518a00cf69956c7ef9d9";
export const LEGACY_UPSTREAM_COMMIT = "913cad27db86bda79cbd53dc5666ab15d28c5d2d";
export const STATE_SCHEMA_VERSION = 5;
export const SALARY_DUEL_RULESET_VERSION = "salary-duel-v1";

export const ENGINE_METADATA = {
  [LEGACY_ENGINE_VERSION]: {
    schemaVersion: 1,
    upstreamCommit: LEGACY_UPSTREAM_COMMIT,
    rngMode: "cursor",
  },
  [CORE_ENGINE_VERSION]: {
    schemaVersion: 2,
    upstreamCommit: LEGACY_UPSTREAM_COMMIT,
    rngMode: "cursor",
  },
  [MULTI_LEAGUE_ENGINE_VERSION]: {
    schemaVersion: 3,
    upstreamCommit: LEGACY_UPSTREAM_COMMIT,
    rngMode: "cursor",
  },
  [FOUR_POSITION_ENGINE_VERSION]: {
    schemaVersion: 4,
    upstreamCommit: UPSTREAM_COMMIT,
    rngMode: "keyed",
  },
  [ENGINE_VERSION]: {
    schemaVersion: STATE_SCHEMA_VERSION,
    upstreamCommit: UPSTREAM_COMMIT,
    rngMode: "keyed",
  },
} as const;

export type PositionGroup = "pitcher" | "catcher" | "infielder" | "outfielder";
export type DefensivePosition = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH";
export type PitcherAbilityKey = "stamina" | "velocity" | "control" | "breaking";
export type HitterAbilityKey =
  | "stamina"
  | "contact"
  | "power"
  | "speed"
  | "eye"
  | "range"
  | "fielding"
  | "arm"
  | "calling";
export type AbilityKey = PitcherAbilityKey | HitterAbilityKey;
export type Stage = "high_school" | "university" | "amateur_club" | "professional" | "retired";
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
export type ScoutingMarket = "cpbl" | "npb" | "mlb";
export type ScoutingTier = "unseen" | "watchlist" | "cross_check" | "invited";
export type DraftEligibility =
  | "none"
  | "tryout"
  | "coach_recommendation"
  | "club_recommendation"
  | "national_team_award";

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
  velocity?: number;
  control?: number;
  breaking?: number;
  contact?: number;
  power?: number;
  speed?: number;
  eye?: number;
  range?: number;
  fielding?: number;
  arm?: number;
  calling?: number;
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

export interface SeasonBase {
  seasonId?: string;
  calendarYear?: number;
  seasonLabel?: string;
  league?: LeagueKey;
  engagement?: SeasonEngagement;
  year: number;
  age: number;
  level: LeagueLevel;
  team: string;
  games: number;
  injured: "none" | "minor" | "major" | "rehab";
  awards: string[];
}

export interface PitcherSeasonStats extends SeasonBase {
  kind?: "pitcher";
  role: PitcherRole;
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
}

export interface HitterSeasonStats extends SeasonBase {
  kind: "hitter";
  position: DefensivePosition;
  plateAppearances: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  walks: number;
  stolenBases: number;
  average: number;
  onBasePercentage: number;
  slugging: number;
  ops: number;
  defense: number;
}

export type SeasonStats = PitcherSeasonStats | HitterSeasonStats;

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
  topLevelServiceYears?: number;
  clubControlled?: boolean;
  peakAnnualSalary?: number;
}

export interface InjuryState {
  rehabSeasons: number;
  temporaryPenalty: number;
  tjLoad: number;
  tjCount: number;
}

export interface ScoutingReport {
  year: number;
  market: ScoutingMarket;
  tier: ScoutingTier;
  summary: string;
  strength: AbilityKey;
  concern: AbilityKey;
}

export interface ScoutingState {
  exposure: number;
  markets: Record<
    ScoutingMarket,
    { internalRating: number; tier: ScoutingTier; lastEvaluatedYear: number | null }
  >;
  draftEligibility: DraftEligibility;
  draftAttempts: number;
  reports: ScoutingReport[];
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
  peakAnnualSalary?: number;
  lastAnnualSalary?: number;
  positionGroup?: PositionGroup;
  primaryPosition?: DefensivePosition;
  finalTeam?: string;
  finalLeague?: LeagueKey;
  careerHighlights?: string[];
  careerGames?: number;
  careerHits?: number;
  careerHomeRuns?: number;
  careerRbis?: number;
  careerStolenBases?: number;
  careerAverage?: number | null;
  careerOps?: number | null;
  honors: string[];
  traits: TraitKey[];
  ending: string;
  seed: string;
  engineVersion: string;
  contentPackVersion?: string;
  contentHash?: string;
  leagueTotals?: Array<{
    league: LeagueKey;
    seasons: number;
    games: number;
    innings: number;
    wins: number;
    saves: number;
    strikeouts: number;
    plateAppearances?: number;
    hits?: number;
    homeRuns?: number;
    rbis?: number;
    stolenBases?: number;
  }>;
  family?: {
    status: LifeState["status"];
    partner: string | null;
    children: number;
  };
  highestScoutingTier?: ScoutingTier;
  scoutingHighlights?: string[];
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
  canEnterDraft?: boolean;
  canContinueSchool: boolean;
  canJoinAmateur?: boolean;
  canRetire?: boolean;
  schoolLabel: "university" | "remain_university" | null;
}

export interface ScoutOffer {
  id: string;
  kind: "cpbl_tryout" | "cpbl_recommendation" | "npb_contract" | "mlb_contract" | "cpbl_direct";
  label: string;
  team?: string;
  level?: LeagueLevel;
  salary?: number;
  years?: number;
}

export interface ScoutOpportunityDecision {
  type: "scout_opportunity";
  offers: ScoutOffer[];
  fallback: "continue_school" | "join_amateur" | "remain_amateur" | "retire";
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

export interface FreeAgencyDecision {
  type: "free_agency_decision";
  homeBaseSalary: number;
}

export interface ContractTermsDecision {
  type: "contract_terms";
  team: string;
  level: LeagueLevel;
  source: "home" | "market";
  offers: ContractDecision["offers"];
}

export interface FreeAgentMarketDecision {
  type: "free_agent_market";
  homeBaseSalary: number;
  offers: ContractDecision["offers"];
  returnMultiplier: 0.9 | 0.7;
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
  | ScoutOpportunityDecision
  | TjDecision
  | ContractDecision
  | FreeAgencyDecision
  | ContractTermsDecision
  | FreeAgentMarketDecision
  | CareerDecision
  | LifeDecision
  | AblDecision
  | InternationalDecision;

export interface CareerState {
  schemaVersion: number;
  engineVersion: string;
  contentPackVersion?: string;
  contentHash?: string;
  upstreamCommit: string;
  seed: string;
  rngState: number;
  positionGroup?: PositionGroup;
  primaryPosition?: DefensivePosition;
  utilityRole?: boolean;
  seasonAppearanceModifier?: number;
  seasonDefenseBonus?: number;
  positionSalaryBonusDisabled?: boolean;
  internationalEventChoice?: "family" | "baseball" | null;
  scouting?: ScoutingState;
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
  | {
      type: "choose_draft";
      choice: "draft" | "continue_school" | "join_amateur" | "retire";
    }
  | { type: "choose_scout_opportunity"; choice: string }
  | { type: "choose_tj"; choice: "surgery" | "injection" }
  | { type: "choose_contract"; choice: string }
  | { type: "choose_free_agency"; choice: "home" | "market" | "retire" }
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
  positionGroup?: PositionGroup;
}

export type SalaryDuelStatus =
  | "pending"
  | "active"
  | "completed"
  | "forfeited"
  | "declined"
  | "expired"
  | "no_contest"
  | "cancelled_privacy"
  | "invalid";

export interface SalaryDuelPlayer {
  duelId: string;
  slot: 1 | 2;
  discordUserId: string | null;
  playerName: string | null;
  careerId: string | null;
  status: "invited" | "playing" | "completed" | "forfeited" | "expired" | "deleted";
  totalEarnings: number | null;
  peakAnnualSalary: number | null;
  lastAnnualSalary: number | null;
  finalStateHash: string | null;
  resultChannelId: string | null;
  resultMessageId: string | null;
  finishedAt: Date | null;
}

export interface NewSalaryDuelInput {
  id: string;
  creatorUserId: string;
  creatorPlayerName: string;
  positionGroup: PositionGroup;
  inviteCodeHash: string;
  inviteExpiresAt: Date;
  engineVersion: string;
  rulesetVersion: string;
}

export interface JoinSalaryDuelInput {
  inviteCodeHash: string;
  joinerUserId: string;
  joinerPlayerName: string;
  privateSeed: string;
  seedCommitment: string;
  now: Date;
  deadlineAt: Date;
  careerIds: readonly [string, string];
}

export interface SalaryDuel {
  id: string;
  status: SalaryDuelStatus;
  positionGroup: PositionGroup;
  engineVersion: string;
  rulesetVersion: string;
  seedCommitment: string | null;
  revealedSeed: string | null;
  winnerSlot: 1 | 2 | null;
  outcomeReason: "score" | "draw" | "forfeit" | "timeout" | "privacy" | "invalid" | null;
  inviteExpiresAt: Date;
  deadlineAt: Date | null;
  players: SalaryDuelPlayer[];
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
