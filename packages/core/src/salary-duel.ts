import { CONTENT_PACK_HASH } from "@yakyulife/content";
import { ActiveCareerExistsError, DomainError } from "./errors.ts";
import type { Clock, IdGenerator, SalaryDuelRepository } from "./ports.ts";
import {
  ENGINE_VERSION,
  type PositionGroup,
  SALARY_DUEL_RULESET_VERSION,
  type SalaryDuel,
} from "./types.ts";

export const CURRENT_SALARY_DUEL_RULESET_VERSION = `${SALARY_DUEL_RULESET_VERSION}:${CONTENT_PACK_HASH}`;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function randomToken(bytes: number): Uint8Array {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return buffer;
}

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase().replaceAll("O", "0").replaceAll("I", "1").replaceAll("L", "1");
}

export function createInviteCode(): string {
  const bytes = randomToken(12);
  return Array.from(bytes, (value) => CROCKFORD[value % CROCKFORD.length]).join("");
}

export function createPrivateSeed(): string {
  return Buffer.from(randomToken(16)).toString("base64url");
}

export class SalaryDuelService {
  public constructor(
    private readonly repository: SalaryDuelRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async create(input: {
    creatorUserId: string;
    creatorPlayerName: string;
    positionGroup: PositionGroup;
  }): Promise<{ duel: SalaryDuel; inviteCode: string }> {
    if (await this.repository.findLiveByUser(input.creatorUserId))
      throw new ActiveCareerExistsError();
    const name = input.creatorPlayerName.trim();
    if (!name || Array.from(name).length > 10) throw new DomainError("球員姓名須為 1–10 字");
    const inviteCode = createInviteCode();
    const now = this.clock.now();
    const duel = await this.repository.createPending({
      id: this.ids.next(),
      creatorUserId: input.creatorUserId,
      creatorPlayerName: name,
      positionGroup: input.positionGroup,
      inviteCodeHash: sha256(inviteCode),
      inviteExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_SALARY_DUEL_RULESET_VERSION,
    });
    return { duel, inviteCode };
  }

  public async join(input: { inviteCode: string; joinerUserId: string; joinerPlayerName: string }) {
    const code = normalizeInviteCode(input.inviteCode);
    if (code.length !== 12 || [...code].some((character) => !CROCKFORD.includes(character)))
      throw new DomainError("邀請碼格式不正確");
    const name = input.joinerPlayerName.trim();
    if (!name || Array.from(name).length > 10) throw new DomainError("球員姓名須為 1–10 字");
    const privateSeed = createPrivateSeed();
    const now = this.clock.now();
    return this.repository.join({
      inviteCodeHash: sha256(code),
      joinerUserId: input.joinerUserId,
      joinerPlayerName: name,
      privateSeed,
      seedCommitment: sha256(privateSeed),
      now,
      deadlineAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      careerIds: [this.ids.next(), this.ids.next()],
    });
  }

  public preview(inviteCode: string): Promise<SalaryDuel | null> {
    const code = normalizeInviteCode(inviteCode);
    if (code.length !== 12) return Promise.resolve(null);
    return this.repository.findPendingByInviteHash(sha256(code));
  }

  public getStatus(discordUserId: string): Promise<SalaryDuel | null> {
    return this.repository.findLatestByUser(discordUserId);
  }

  public getLive(discordUserId: string): Promise<SalaryDuel | null> {
    return this.repository.findLiveByUser(discordUserId);
  }

  public cancel(discordUserId: string): Promise<boolean> {
    return this.repository.cancelPending(discordUserId);
  }

  public maintain(): Promise<void> {
    return this.repository.maintain(this.clock.now());
  }

  public findUndeliveredResults(limit = 20): Promise<SalaryDuel[]> {
    return this.repository.findUndeliveredTerminal(limit);
  }

  public markResultDelivered(
    duelId: string,
    slot: 1 | 2,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    return this.repository.markResultDelivered(duelId, slot, channelId, messageId);
  }
}
