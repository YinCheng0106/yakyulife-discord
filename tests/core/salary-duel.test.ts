import { describe, expect, test } from "bun:test";
import {
  type CareerRecord,
  CURRENT_SALARY_DUEL_RULESET_VERSION,
  createInviteCode,
  ENGINE_VERSION,
  type JoinSalaryDuelInput,
  type NewSalaryDuelInput,
  normalizeInviteCode,
  type SalaryDuel,
  type SalaryDuelRepository,
  SalaryDuelService,
} from "@yakyulife/core";

function pending(input: NewSalaryDuelInput): SalaryDuel {
  return {
    id: input.id,
    status: "pending",
    positionGroup: input.positionGroup,
    engineVersion: input.engineVersion,
    rulesetVersion: input.rulesetVersion,
    seedCommitment: null,
    revealedSeed: null,
    winnerSlot: null,
    outcomeReason: null,
    inviteExpiresAt: input.inviteExpiresAt,
    deadlineAt: null,
    players: [
      {
        duelId: input.id,
        slot: 1,
        discordUserId: input.creatorUserId,
        playerName: input.creatorPlayerName,
        careerId: null,
        status: "invited",
        totalEarnings: null,
        peakAnnualSalary: null,
        lastAnnualSalary: null,
        finalStateHash: null,
        resultChannelId: null,
        resultMessageId: null,
        finishedAt: null,
      },
    ],
  };
}

class DuelRepositoryStub implements SalaryDuelRepository {
  public duel: SalaryDuel | null = null;
  public joined: JoinSalaryDuelInput | null = null;
  async createPending(input: NewSalaryDuelInput) {
    this.duel = pending(input);
    return this.duel;
  }
  async findPendingByInviteHash() {
    return this.duel;
  }
  async join(input: JoinSalaryDuelInput) {
    this.joined = input;
    if (!this.duel) throw new Error("missing duel");
    const duel = {
      ...this.duel,
      status: "active" as const,
      seedCommitment: input.seedCommitment,
      deadlineAt: input.deadlineAt,
    };
    return { duel, careers: [] as unknown as readonly [CareerRecord, CareerRecord] };
  }
  async findLiveByUser() {
    return this.duel;
  }
  async findLatestByUser() {
    return this.duel;
  }
  async cancelPending() {
    return true;
  }
  async revealPrivateSeed() {
    return null;
  }
  async maintain() {}
  async findUndeliveredTerminal() {
    return [];
  }
  async markResultDelivered() {}
}

describe("salary duel service", () => {
  test("creates a non-ambiguous 12-character invite and pins engine rules", async () => {
    const code = createInviteCode();
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    expect(normalizeInviteCode("oill-ignored".slice(0, 4))).toBe("0111");

    const repository = new DuelRepositoryStub();
    repository.duel = null;
    const service = new SalaryDuelService(
      repository,
      { now: () => new Date("2026-08-13T00:00:00Z") },
      { next: () => crypto.randomUUID() },
    );
    const created = await service.create({
      creatorUserId: "u1",
      creatorPlayerName: "先發投手",
      positionGroup: "pitcher",
    });
    expect(created.inviteCode).toHaveLength(12);
    expect(created.duel.engineVersion).toBe(ENGINE_VERSION);
    expect(created.duel.rulesetVersion).toBe(CURRENT_SALARY_DUEL_RULESET_VERSION);
    expect(created.duel.inviteExpiresAt.toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});
