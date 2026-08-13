import type {
  CareerJournalEntry,
  CareerListItem,
  CareerLocation,
  CareerRecord,
  CareerState,
  CommitActionInput,
  CommitActionResult,
  EngineResult,
  JoinSalaryDuelInput,
  NewSalaryDuelInput,
  SalaryDuel,
} from "./types.ts";

export type CareerTransition = (state: CareerState) => EngineResult;

export interface CareerRepository {
  create(career: CareerRecord): Promise<CareerRecord>;
  findActiveByUser(discordUserId: string): Promise<CareerRecord | null>;
  findLatestCompletedByUser(discordUserId: string): Promise<CareerRecord | null>;
  findById(careerId: string): Promise<CareerRecord | null>;
  findOwnedById(careerId: string, discordUserId: string): Promise<CareerRecord | null>;
  listByUser(discordUserId: string, limit: number): Promise<CareerListItem[]>;
  listJournal(careerId: string, discordUserId: string): Promise<CareerJournalEntry[]>;
  commitAction(input: CommitActionInput, transition: CareerTransition): Promise<CommitActionResult>;
  updateLocation(careerId: string, discordUserId: string, location: CareerLocation): Promise<void>;
  abandon(careerId: string, discordUserId: string): Promise<boolean>;
  deleteByUser(discordUserId: string): Promise<number>;
}

export interface SalaryDuelRepository {
  createPending(input: NewSalaryDuelInput): Promise<SalaryDuel>;
  findPendingByInviteHash(inviteCodeHash: string): Promise<SalaryDuel | null>;
  join(
    input: JoinSalaryDuelInput,
  ): Promise<{ duel: SalaryDuel; careers: readonly [CareerRecord, CareerRecord] }>;
  findLiveByUser(discordUserId: string): Promise<SalaryDuel | null>;
  findLatestByUser(discordUserId: string): Promise<SalaryDuel | null>;
  cancelPending(discordUserId: string): Promise<boolean>;
  revealPrivateSeed(duelId: string): Promise<string | null>;
  maintain(now: Date): Promise<void>;
  findUndeliveredTerminal(limit: number): Promise<SalaryDuel[]>;
  markResultDelivered(
    duelId: string,
    slot: 1 | 2,
    channelId: string,
    messageId: string,
  ): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
}
