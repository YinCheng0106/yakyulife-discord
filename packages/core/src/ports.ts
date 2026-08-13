import type {
  CareerJournalEntry,
  CareerListItem,
  CareerLocation,
  CareerRecord,
  CareerState,
  CommitActionInput,
  CommitActionResult,
  EngineResult,
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
