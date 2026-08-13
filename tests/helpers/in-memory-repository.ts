import {
  ActiveCareerExistsError,
  type CareerJournalEntry,
  type CareerListItem,
  type CareerLocation,
  type CareerRecord,
  type CareerRepository,
  type CommitActionInput,
  type CommitActionResult,
} from "@yakyulife/core";

export class InMemoryCareerRepository implements CareerRepository {
  private readonly records = new Map<string, CareerRecord>();
  private readonly interactions = new Map<string, string>();
  private readonly journals = new Map<string, CareerJournalEntry[]>();

  public async create(career: CareerRecord): Promise<CareerRecord> {
    if (
      [...this.records.values()].some(
        (value) => value.discordUserId === career.discordUserId && value.status === "active",
      )
    ) {
      throw new ActiveCareerExistsError();
    }
    this.records.set(career.id, structuredClone(career));
    this.journals.set(
      career.id,
      (career.state.recentEvents ?? []).map((event, ordinal) => ({
        ...event,
        careerId: career.id,
        stateRevision: 0,
        ordinal,
        createdAt: career.createdAt,
      })),
    );
    return structuredClone(career);
  }

  public async findActiveByUser(discordUserId: string): Promise<CareerRecord | null> {
    const record = [...this.records.values()].find(
      (value) => value.discordUserId === discordUserId && value.status === "active",
    );
    return record ? structuredClone(record) : null;
  }

  public async findLatestCompletedByUser(discordUserId: string): Promise<CareerRecord | null> {
    const record = [...this.records.values()]
      .filter((value) => value.discordUserId === discordUserId && value.status === "completed")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
    return record ? structuredClone(record) : null;
  }

  public async findById(careerId: string): Promise<CareerRecord | null> {
    const record = this.records.get(careerId);
    return record ? structuredClone(record) : null;
  }

  public async findOwnedById(
    careerId: string,
    discordUserId: string,
  ): Promise<CareerRecord | null> {
    const record = this.records.get(careerId);
    return record?.discordUserId === discordUserId ? structuredClone(record) : null;
  }

  public async listByUser(discordUserId: string, limit: number): Promise<CareerListItem[]> {
    return [...this.records.values()]
      .filter((career) => career.discordUserId === discordUserId)
      .sort(
        (left, right) =>
          Number(right.status === "active") - Number(left.status === "active") ||
          right.updatedAt.getTime() - left.updatedAt.getTime(),
      )
      .slice(0, limit)
      .map((career) => ({
        id: career.id,
        name: career.state.name,
        status: career.status,
        startYear: career.state.seasons[0]?.year ?? 2026,
        endYear: career.state.year,
        updatedAt: career.updatedAt,
      }));
  }

  public async listJournal(careerId: string, discordUserId: string): Promise<CareerJournalEntry[]> {
    const career = this.records.get(careerId);
    if (career?.discordUserId !== discordUserId) return [];
    return structuredClone(this.journals.get(careerId) ?? []);
  }

  public async commitAction(
    input: CommitActionInput,
    transition: Parameters<CareerRepository["commitAction"]>[1],
  ): Promise<CommitActionResult> {
    const existingId = this.interactions.get(input.interactionId);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (!existing) return { status: "not_found" };
      return { status: "duplicate", career: structuredClone(existing) };
    }
    const career = this.records.get(input.careerId);
    if (!career) return { status: "not_found" };
    if (career.discordUserId !== input.discordUserId) return { status: "forbidden" };
    if (career.status !== "active") return { status: "inactive", career: structuredClone(career) };
    if (career.stateRevision !== input.expectedRevision)
      return { status: "stale", career: structuredClone(career) };
    const result = transition(career.state);
    const updated: CareerRecord = {
      ...career,
      status: result.state.summary ? "completed" : "active",
      stateRevision: career.stateRevision + 1,
      state: result.state,
      summary: result.state.summary,
      updatedAt: new Date(),
      completedAt: result.state.summary ? new Date() : null,
    };
    this.records.set(updated.id, structuredClone(updated));
    this.interactions.set(input.interactionId, updated.id);
    const journal = this.journals.get(updated.id) ?? [];
    journal.push(
      ...result.events.map((event, ordinal) => ({
        ...event,
        careerId: updated.id,
        stateRevision: updated.stateRevision,
        ordinal,
        createdAt: updated.updatedAt,
      })),
    );
    this.journals.set(updated.id, journal);
    return { status: "applied", career: structuredClone(updated), events: result.events };
  }

  public async updateLocation(
    careerId: string,
    discordUserId: string,
    location: CareerLocation,
  ): Promise<void> {
    const career = this.records.get(careerId);
    if (!career || career.discordUserId !== discordUserId) throw new Error("Career not found");
    career.location = structuredClone(location);
  }

  public async abandon(careerId: string, discordUserId: string): Promise<boolean> {
    const career = this.records.get(careerId);
    if (!career || career.discordUserId !== discordUserId || career.status !== "active")
      return false;
    career.status = "abandoned";
    return true;
  }

  public async deleteByUser(discordUserId: string): Promise<number> {
    let count = 0;
    for (const [id, career] of this.records) {
      if (career.discordUserId === discordUserId) {
        this.records.delete(id);
        this.journals.delete(id);
        count += 1;
      }
    }
    return count;
  }
}
