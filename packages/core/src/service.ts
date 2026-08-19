import { createCareerState, reduceCareer } from "./engine.ts";
import { ActiveCareerExistsError, DomainError } from "./errors.ts";
import type { CareerRepository, Clock, IdGenerator } from "./ports.ts";
import {
  type CareerHistory,
  type CareerListItem,
  type CareerLocation,
  type CareerRecord,
  CORE_ENGINE_VERSION,
  type CommitActionInput,
  type CommitActionResult,
  ENGINE_VERSION,
  FOUR_POSITION_ENGINE_VERSION,
  LEGACY_ENGINE_VERSION,
  MULTI_LEAGUE_ENGINE_VERSION,
  type NewCareerInput,
} from "./types.ts";

export class CareerService {
  public constructor(
    private readonly repository: CareerRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly newCareerEngineVersion: string = ENGINE_VERSION,
  ) {}

  public async start(input: NewCareerInput): Promise<CareerRecord> {
    const active = await this.repository.findActiveByUser(input.discordUserId);
    if (active) throw new ActiveCareerExistsError();
    const name = input.name.trim();
    if (name.length > 10) throw new DomainError("球員姓名最多 10 個字元");
    const seed = input.seed.trim();
    if (seed.length > 24) throw new DomainError("種子碼最多 24 個字元");
    const now = this.clock.now();
    if (
      ![
        LEGACY_ENGINE_VERSION,
        CORE_ENGINE_VERSION,
        MULTI_LEAGUE_ENGINE_VERSION,
        FOUR_POSITION_ENGINE_VERSION,
        ENGINE_VERSION,
      ].includes(this.newCareerEngineVersion)
    )
      throw new DomainError("不支援的新生涯 engine 版本");
    if (
      this.newCareerEngineVersion !== FOUR_POSITION_ENGINE_VERSION &&
      this.newCareerEngineVersion !== ENGINE_VERSION &&
      input.positionGroup &&
      input.positionGroup !== "pitcher"
    )
      throw new DomainError("舊版 engine 只支援投手生涯");
    const state = createCareerState(
      name,
      seed,
      this.newCareerEngineVersion,
      input.positionGroup ?? "pitcher",
    );
    return this.repository.create({
      id: this.ids.next(),
      discordUserId: input.discordUserId,
      status: "active",
      playMode: input.playMode,
      location: input.location,
      seed: state.seed,
      engineVersion: state.engineVersion,
      upstreamCommit: state.upstreamCommit,
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

  public listCareers(discordUserId: string, limit = 25): Promise<CareerListItem[]> {
    return this.repository.listByUser(discordUserId, Math.min(25, Math.max(1, limit)));
  }

  public async getHistory(discordUserId: string, careerId?: string): Promise<CareerHistory | null> {
    const career = careerId
      ? await this.repository.findOwnedById(careerId, discordUserId)
      : ((await this.repository.findActiveByUser(discordUserId)) ??
        (await this.repository.findLatestCompletedByUser(discordUserId)));
    if (!career) return null;
    const entries = await this.repository.listJournal(career.id, discordUserId);
    const years = [
      ...new Set([
        career.state.year,
        ...career.state.seasons.map((season) => season.calendarYear ?? season.year),
        ...entries.map((entry) => entry.year),
      ]),
    ].sort((left, right) => left - right);
    return { career, entries, years };
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
