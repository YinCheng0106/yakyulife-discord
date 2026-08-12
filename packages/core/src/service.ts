import { createCareerState, reduceCareer } from "./engine.ts";
import { ActiveCareerExistsError, DomainError } from "./errors.ts";
import type { CareerRepository, Clock, IdGenerator } from "./ports.ts";
import {
  type CareerLocation,
  type CareerRecord,
  type CommitActionInput,
  type CommitActionResult,
  ENGINE_VERSION,
  type NewCareerInput,
  UPSTREAM_COMMIT,
} from "./types.ts";

export class CareerService {
  public constructor(
    private readonly repository: CareerRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async start(input: NewCareerInput): Promise<CareerRecord> {
    const active = await this.repository.findActiveByUser(input.discordUserId);
    if (active) throw new ActiveCareerExistsError();
    const name = input.name.trim();
    if (name.length > 10) throw new DomainError("球員姓名最多 10 個字元");
    const seed = input.seed.trim();
    if (seed.length > 24) throw new DomainError("種子碼最多 24 個字元");
    const now = this.clock.now();
    const state = createCareerState(name, seed);
    return this.repository.create({
      id: this.ids.next(),
      discordUserId: input.discordUserId,
      status: "active",
      playMode: input.playMode,
      location: input.location,
      seed: state.seed,
      engineVersion: ENGINE_VERSION,
      upstreamCommit: UPSTREAM_COMMIT,
      stateRevision: 0,
      state,
      summary: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
  }

  public getActive(discordUserId: string): Promise<CareerRecord | null> {
    return this.repository.findActiveByUser(discordUserId);
  }

  public getLatestCompleted(discordUserId: string): Promise<CareerRecord | null> {
    return this.repository.findLatestCompletedByUser(discordUserId);
  }

  public getById(careerId: string): Promise<CareerRecord | null> {
    return this.repository.findById(careerId);
  }

  public applyAction(input: CommitActionInput): Promise<CommitActionResult> {
    return this.repository.commitAction(input, (state) => reduceCareer(state, input.action));
  }

  public updateLocation(
    careerId: string,
    discordUserId: string,
    location: CareerLocation,
  ): Promise<void> {
    return this.repository.updateLocation(careerId, discordUserId, location);
  }

  public abandon(careerId: string, discordUserId: string): Promise<boolean> {
    return this.repository.abandon(careerId, discordUserId);
  }

  public deleteData(discordUserId: string): Promise<number> {
    return this.repository.deleteByUser(discordUserId);
  }
}

export const systemClock: Clock = { now: () => new Date() };
export const cryptoIdGenerator: IdGenerator = { next: () => crypto.randomUUID() };
