import {
  ActiveCareerExistsError,
  type CareerJournalEntry,
  type CareerListItem,
  type CareerLocation,
  type CareerRecord,
  type CareerRepository,
  type CareerStatus,
  type CommitActionInput,
  type CommitActionResult,
  createCareerState,
  DomainError,
  ExpectedStateError,
  type GameAction,
  type JoinSalaryDuelInput,
  type NewSalaryDuelInput,
  reduceCareer,
  type SalaryDuel,
  type SalaryDuelPlayer,
  type SalaryDuelRepository,
} from "@yakyulife/core";
import { SQL, type TransactionSQL } from "bun";
import { parseCareerState, parseCareerSummary } from "./state.ts";

interface CareerRow {
  id: string;
  discord_user_id: string;
  status: CareerStatus;
  play_mode: "dm" | "channel";
  guild_id: string | null;
  channel_id: string | null;
  message_id: string | null;
  seed: string;
  engine_version: string;
  upstream_commit: string;
  state_revision: number | string;
  state: unknown;
  summary: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

interface JournalRow {
  career_id: string;
  state_revision: number | string;
  ordinal: number | string;
  game_year: number | string;
  player_age: number | string;
  category: CareerJournalEntry["category"];
  tone: CareerJournalEntry["tone"];
  title: string;
  body: string;
  created_at: Date | string;
}

interface DuelRow {
  id: string;
  status: SalaryDuel["status"];
  position_group: SalaryDuel["positionGroup"];
  engine_version: string;
  ruleset_version: string;
  private_seed: string | null;
  seed_commitment: string | null;
  winner_slot: 1 | 2 | null;
  outcome_reason: SalaryDuel["outcomeReason"];
  invite_expires_at: Date | string;
  deadline_at: Date | string | null;
  decided_at: Date | string | null;
}

interface DuelPlayerRow {
  duel_id: string;
  slot: 1 | 2;
  discord_user_id: string | null;
  player_name: string | null;
  career_id: string | null;
  status: SalaryDuelPlayer["status"];
  total_earnings: number | string | null;
  peak_annual_salary: number | string | null;
  last_annual_salary: number | string | null;
  final_state_hash: string | null;
  result_channel_id: string | null;
  result_message_id: string | null;
  finished_at: Date | string | null;
}

function mapDuelPlayer(row: DuelPlayerRow): SalaryDuelPlayer {
  return {
    duelId: row.duel_id,
    slot: row.slot,
    discordUserId: row.discord_user_id,
    playerName: row.player_name,
    careerId: row.career_id,
    status: row.status,
    totalEarnings: row.total_earnings === null ? null : Number(row.total_earnings),
    peakAnnualSalary: row.peak_annual_salary === null ? null : Number(row.peak_annual_salary),
    lastAnnualSalary: row.last_annual_salary === null ? null : Number(row.last_annual_salary),
    finalStateHash: row.final_state_hash,
    resultChannelId: row.result_channel_id,
    resultMessageId: row.result_message_id,
    finishedAt: row.finished_at === null ? null : toDate(row.finished_at),
  };
}

function mapDuel(row: DuelRow, players: DuelPlayerRow[]): SalaryDuel {
  const terminal = [
    "completed",
    "forfeited",
    "expired",
    "no_contest",
    "cancelled_privacy",
    "invalid",
  ].includes(row.status);
  return {
    id: row.id,
    status: row.status,
    positionGroup: row.position_group,
    engineVersion: row.engine_version,
    rulesetVersion: row.ruleset_version,
    seedCommitment: row.seed_commitment,
    revealedSeed: terminal ? row.private_seed : null,
    winnerSlot: row.winner_slot,
    outcomeReason: row.outcome_reason,
    inviteExpiresAt: toDate(row.invite_expires_at),
    deadlineAt: row.deadline_at === null ? null : toDate(row.deadline_at),
    players: players.map(mapDuelPlayer),
  };
}

function mapJournal(row: JournalRow): CareerJournalEntry {
  return {
    careerId: row.career_id,
    stateRevision: Number(row.state_revision),
    ordinal: Number(row.ordinal),
    year: Number(row.game_year),
    age: Number(row.player_age),
    category: row.category,
    tone: row.tone,
    title: row.title,
    body: row.body,
    createdAt: toDate(row.created_at),
  };
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid date");
  return date;
}

function mapCareer(row: CareerRow): CareerRecord {
  const revision = Number(row.state_revision);
  if (
    typeof row.id !== "string" ||
    typeof row.discord_user_id !== "string" ||
    !["active", "completed", "abandoned"].includes(row.status) ||
    !["dm", "channel"].includes(row.play_mode) ||
    typeof row.seed !== "string" ||
    typeof row.engine_version !== "string" ||
    typeof row.upstream_commit !== "string" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    throw new Error("Database returned an invalid career row");
  }
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    status: row.status,
    playMode: row.play_mode,
    location: {
      guildId: row.guild_id,
      channelId: row.channel_id,
      messageId: row.message_id,
    },
    seed: row.seed,
    engineVersion: row.engine_version,
    upstreamCommit: row.upstream_commit,
    stateRevision: revision,
    state: parseCareerState(row.state),
    summary: parseCareerSummary(row.summary),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    completedAt: row.completed_at === null ? null : toDate(row.completed_at),
  };
}

function rowsOf<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new Error("Database returned an invalid result");
  return value as T[];
}

export class PostgresCareerRepository implements CareerRepository, SalaryDuelRepository {
  public constructor(private readonly sql: SQL) {}

  public async create(career: CareerRecord): Promise<CareerRecord> {
    try {
      return await this.withRuntimeRole(async (tx) => {
        const liveDuels = rowsOf<{ id: string }>(
          await tx`
            select d.id from yakyulife.salary_duels d
            join yakyulife.salary_duel_players p on p.duel_id = d.id
            where p.discord_user_id = ${career.discordUserId}
              and d.status in ('pending', 'active')
            limit 1
          `,
        );
        if (liveDuels.length > 0) throw new ActiveCareerExistsError();
        const rows = rowsOf<CareerRow>(
          await tx`
          insert into yakyulife.careers (
            id, discord_user_id, status, play_mode, guild_id, channel_id, message_id,
            seed, engine_version, upstream_commit, state_revision, state, summary,
            created_at, updated_at, completed_at
          ) values (
            ${career.id}, ${career.discordUserId}, ${career.status}, ${career.playMode},
            ${career.location.guildId}, ${career.location.channelId}, ${career.location.messageId},
            ${career.seed}, ${career.engineVersion}, ${career.upstreamCommit},
            ${career.stateRevision}, ${JSON.stringify(career.state)}::jsonb,
            ${career.summary === null ? null : JSON.stringify(career.summary)}::jsonb,
            ${career.createdAt}, ${career.updatedAt}, ${career.completedAt}
          ) returning *
        `,
        );
        const row = rows[0];
        if (!row) throw new Error("Career insert returned no row");
        for (const [ordinal, event] of (career.state.recentEvents ?? []).entries()) {
          await tx`
            insert into yakyulife.career_journal (
              career_id, state_revision, ordinal, game_year, player_age,
              category, tone, title, body
            ) values (
              ${career.id}, 0, ${ordinal}, ${event.year}, ${event.age},
              ${event.category}, ${event.tone}, ${event.title}, ${event.body}
            )
          `;
        }
        return mapCareer(row);
      });
    } catch (error) {
      if (error instanceof SQL.PostgresError && error.code === "23505") {
        throw new ActiveCareerExistsError();
      }
      throw error;
    }
  }

  public findActiveByUser(discordUserId: string): Promise<CareerRecord | null> {
    return this.withRuntimeRole(async (tx) =>
      this.readOne(tx`
        select * from yakyulife.careers
        where discord_user_id = ${discordUserId} and status = 'active'
        limit 1
      `),
    );
  }

  public findById(careerId: string): Promise<CareerRecord | null> {
    return this.withRuntimeRole(async (tx) =>
      this.readOne(tx`
        select * from yakyulife.careers where id = ${careerId} limit 1
      `),
    );
  }

  public findOwnedById(careerId: string, discordUserId: string): Promise<CareerRecord | null> {
    return this.withRuntimeRole(async (tx) =>
      this.readOne(tx`
        select * from yakyulife.careers
        where id = ${careerId} and discord_user_id = ${discordUserId}
        limit 1
      `),
    );
  }

  public listByUser(discordUserId: string, limit: number): Promise<CareerListItem[]> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<CareerRow>(
        await tx`
          select * from yakyulife.careers
          where discord_user_id = ${discordUserId}
          order by (status = 'active') desc, updated_at desc
          limit ${limit}
        `,
      );
      return rows.map((row) => {
        const career = mapCareer(row);
        return {
          id: career.id,
          name: career.state.name,
          status: career.status,
          startYear: career.state.seasons[0]?.year ?? 2026,
          endYear: career.state.year,
          updatedAt: career.updatedAt,
        };
      });
    });
  }

  public listJournal(careerId: string, discordUserId: string): Promise<CareerJournalEntry[]> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<JournalRow>(
        await tx`
          select j.* from yakyulife.career_journal j
          join yakyulife.careers c on c.id = j.career_id
          where j.career_id = ${careerId} and c.discord_user_id = ${discordUserId}
          order by j.state_revision, j.ordinal
        `,
      );
      return rows.map(mapJournal);
    });
  }

  public findLatestCompletedByUser(discordUserId: string): Promise<CareerRecord | null> {
    return this.withRuntimeRole(async (tx) =>
      this.readOne(tx`
        select * from yakyulife.careers
        where discord_user_id = ${discordUserId} and status = 'completed'
        order by completed_at desc nulls last
        limit 1
      `),
    );
  }

  public async commitAction(
    input: CommitActionInput,
    transition: Parameters<CareerRepository["commitAction"]>[1],
  ): Promise<CommitActionResult> {
    return this.withRuntimeRole(async (tx) => {
      const duplicateRows = rowsOf<CareerRow>(
        await tx`
        select c.* from yakyulife.career_actions a
        join yakyulife.careers c on c.id = a.career_id
        where a.discord_interaction_id = ${input.interactionId}
        limit 1
      `,
      );
      const duplicate = duplicateRows[0];
      if (duplicate) return { status: "duplicate", career: mapCareer(duplicate) };

      const lockedRows = rowsOf<CareerRow>(
        await tx`
        select * from yakyulife.careers where id = ${input.careerId} for update
      `,
      );
      const row = lockedRows[0];
      if (!row) return { status: "not_found" };
      const career = mapCareer(row);
      if (career.discordUserId !== input.discordUserId) return { status: "forbidden" };
      if (career.status !== "active") return { status: "inactive", career };
      if (career.stateRevision !== input.expectedRevision) {
        return { status: "stale", career };
      }

      const result = transition(career.state);
      const afterRevision = career.stateRevision + 1;
      const now = new Date();
      const nextStatus: CareerStatus = result.state.summary === null ? "active" : "completed";
      const completedAt = nextStatus === "completed" ? now : career.completedAt;
      const updatedRows = rowsOf<CareerRow>(
        await tx`
        update yakyulife.careers set
          status = ${nextStatus},
          state_revision = ${afterRevision},
          state = ${JSON.stringify(result.state)}::jsonb,
          summary = ${result.state.summary === null ? null : JSON.stringify(result.state.summary)}::jsonb,
          updated_at = ${now},
          completed_at = ${completedAt}
        where id = ${career.id}
        returning *
      `,
      );
      const updated = updatedRows[0];
      if (!updated) throw new Error("Career update returned no row");
      await tx`
        insert into yakyulife.career_actions (
          career_id, sequence, discord_interaction_id, action_type, payload,
          before_revision, after_revision
        ) values (
          ${career.id}, ${afterRevision}, ${input.interactionId}, ${input.action.type},
          ${JSON.stringify(input.action)}::jsonb, ${career.stateRevision}, ${afterRevision}
        )
      `;
      for (const [ordinal, event] of result.events.entries()) {
        await tx`
          insert into yakyulife.career_journal (
            career_id, state_revision, ordinal, game_year, player_age,
            category, tone, title, body
          ) values (
            ${career.id}, ${afterRevision}, ${ordinal}, ${event.year}, ${event.age},
            ${event.category}, ${event.tone}, ${event.title}, ${event.body}
          )
        `;
      }
      if (nextStatus === "completed" && result.state.summary) {
        const finalStateHash = new Bun.CryptoHasher("sha256")
          .update(JSON.stringify(result.state))
          .digest("hex");
        await tx`
          update yakyulife.salary_duel_players set
            status = 'completed', total_earnings = ${result.state.summary.totalEarnings},
            peak_annual_salary = ${result.state.summary.peakAnnualSalary ?? 0},
            last_annual_salary = ${result.state.summary.lastAnnualSalary ?? 0},
            final_state_hash = ${finalStateHash}, finished_at = ${now}
          where career_id = ${career.id} and status = 'playing'
        `;
        const duelRows = rowsOf<{ duel_id: string }>(
          await tx`
          select duel_id from yakyulife.salary_duel_players where career_id = ${career.id} limit 1
        `,
        );
        const duelId = duelRows[0]?.duel_id;
        if (duelId) {
          const players = rowsOf<DuelPlayerRow>(
            await tx`
            select * from yakyulife.salary_duel_players where duel_id = ${duelId} order by slot for update
          `,
          );
          if (players.length === 2 && players.every((player) => player.status === "completed")) {
            const [left, right] = players;
            if (left && right) {
              const duelConfigRows = rowsOf<DuelRow>(
                await tx`
                select * from yakyulife.salary_duels where id = ${duelId} for update
              `,
              );
              const duelConfig = duelConfigRows[0];
              let replayValid = Boolean(duelConfig?.private_seed);
              if (duelConfig?.private_seed) {
                for (const player of players) {
                  if (!player.career_id || !player.player_name) {
                    replayValid = false;
                    break;
                  }
                  const actions = rowsOf<{ payload: unknown }>(
                    await tx`
                    select payload from yakyulife.career_actions
                    where career_id = ${player.career_id} order by sequence
                  `,
                  );
                  let replay = createCareerState(
                    player.player_name,
                    duelConfig.private_seed,
                    duelConfig.engine_version,
                    duelConfig.position_group,
                  );
                  try {
                    for (const actionRow of actions) {
                      const payload =
                        typeof actionRow.payload === "string"
                          ? (JSON.parse(actionRow.payload) as GameAction)
                          : (actionRow.payload as GameAction);
                      replay = reduceCareer(replay, payload).state;
                    }
                  } catch {
                    replayValid = false;
                    break;
                  }
                  const replayHash = new Bun.CryptoHasher("sha256")
                    .update(JSON.stringify(replay))
                    .digest("hex");
                  if (
                    replayHash !== player.final_state_hash ||
                    replay.summary?.totalEarnings !== Number(player.total_earnings ?? -1)
                  ) {
                    replayValid = false;
                    break;
                  }
                }
              }
              if (!replayValid) {
                await tx`
                  update yakyulife.salary_duels set status = 'invalid', winner_slot = null,
                    outcome_reason = 'invalid', decided_at = ${now}, seed_revealed_at = ${now}, updated_at = ${now}
                  where id = ${duelId} and status = 'active'
                `;
                return { status: "applied", career: mapCareer(updated), events: result.events };
              }
              const leftScore = Number(left.total_earnings ?? 0);
              const rightScore = Number(right.total_earnings ?? 0);
              const leftPeak = Number(left.peak_annual_salary ?? 0);
              const rightPeak = Number(right.peak_annual_salary ?? 0);
              const winner =
                leftScore === rightScore
                  ? leftPeak === rightPeak
                    ? null
                    : leftPeak > rightPeak
                      ? 1
                      : 2
                  : leftScore > rightScore
                    ? 1
                    : 2;
              await tx`
                update yakyulife.salary_duels set status = 'completed',
                  winner_slot = ${winner}, outcome_reason = ${winner === null ? "draw" : "score"},
                  decided_at = ${now}, seed_revealed_at = ${now}, updated_at = ${now}
                where id = ${duelId} and status = 'active'
              `;
            }
          }
        }
      }
      return { status: "applied", career: mapCareer(updated), events: result.events };
    });
  }

  public async updateLocation(
    careerId: string,
    discordUserId: string,
    location: CareerLocation,
  ): Promise<void> {
    const rows = await this.withRuntimeRole(async (tx) =>
      rowsOf<{ id: string }>(
        await tx`
        update yakyulife.careers set
          guild_id = ${location.guildId}, channel_id = ${location.channelId},
          message_id = ${location.messageId}, updated_at = now()
        where id = ${careerId} and discord_user_id = ${discordUserId}
        returning id
      `,
      ),
    );
    if (rows.length === 0) throw new DomainError("找不到這筆生涯資料");
  }

  public async abandon(careerId: string, discordUserId: string): Promise<boolean> {
    const rows = await this.withRuntimeRole(async (tx) => {
      const duelPlayers = rowsOf<{ duel_id: string; slot: 1 | 2 }>(
        await tx`
        select duel_id, slot from yakyulife.salary_duel_players
        where career_id = ${careerId} and discord_user_id = ${discordUserId} for update
      `,
      );
      const participant = duelPlayers[0];
      if (participant) {
        const winnerSlot = participant.slot === 1 ? 2 : 1;
        await tx`
          update yakyulife.salary_duel_players set status = 'forfeited', finished_at = now()
          where duel_id = ${participant.duel_id} and slot = ${participant.slot} and status = 'playing'
        `;
        await tx`
          update yakyulife.salary_duels set status = 'forfeited', winner_slot = ${winnerSlot},
            outcome_reason = 'forfeit', decided_at = now(), seed_revealed_at = now(), updated_at = now()
          where id = ${participant.duel_id} and status = 'active'
        `;
      }
      return rowsOf<{ id: string }>(
        await tx`
        update yakyulife.careers set status = 'abandoned', updated_at = now()
        where id = ${careerId} and discord_user_id = ${discordUserId} and status = 'active'
        returning id
      `,
      );
    });
    return rows.length > 0;
  }

  public async deleteByUser(discordUserId: string): Promise<number> {
    const rows = await this.withRuntimeRole(async (tx) => {
      const duelRows = rowsOf<{ duel_id: string }>(
        await tx`
        select duel_id from yakyulife.salary_duel_players
        where discord_user_id = ${discordUserId} for update
      `,
      );
      for (const { duel_id: duelId } of duelRows) {
        await tx`
          update yakyulife.salary_duels set status = 'cancelled_privacy', winner_slot = null,
            outcome_reason = 'privacy', decided_at = now(), updated_at = now()
          where id = ${duelId} and status in ('pending', 'active', 'completed', 'forfeited')
        `;
        await tx`
          update yakyulife.salary_duel_players set discord_user_id = null, player_name = null,
            career_id = null, status = 'deleted', total_earnings = null,
            peak_annual_salary = null, last_annual_salary = null, final_state_hash = null
          where duel_id = ${duelId} and discord_user_id = ${discordUserId}
        `;
      }
      return rowsOf<{ id: string }>(
        await tx`delete from yakyulife.careers where discord_user_id = ${discordUserId} returning id`,
      );
    });
    return rows.length;
  }

  public createPending(input: NewSalaryDuelInput): Promise<SalaryDuel> {
    return this.withRuntimeRole(async (tx) => {
      const active = rowsOf<{ id: string }>(
        await tx`
        select id from yakyulife.careers where discord_user_id = ${input.creatorUserId} and status = 'active'
        union all
        select duel_id as id from yakyulife.salary_duel_players
        where discord_user_id = ${input.creatorUserId} and status in ('invited', 'playing') limit 1
      `,
      );
      if (active.length > 0) throw new ActiveCareerExistsError();
      const rows = rowsOf<DuelRow>(
        await tx`
        insert into yakyulife.salary_duels (
          id, status, invite_code_hash, engine_version, ruleset_version, position_group, invite_expires_at
        ) values (
          ${input.id}, 'pending', ${input.inviteCodeHash}, ${input.engineVersion},
          ${input.rulesetVersion}, ${input.positionGroup}, ${input.inviteExpiresAt}
        ) returning *
      `,
      );
      await tx`
        insert into yakyulife.salary_duel_players (
          duel_id, slot, discord_user_id, player_name, status
        ) values (${input.id}, 1, ${input.creatorUserId}, ${input.creatorPlayerName}, 'invited')
      `;
      const row = rows[0];
      if (!row) throw new Error("Salary duel insert returned no row");
      const players = rowsOf<DuelPlayerRow>(
        await tx`select * from yakyulife.salary_duel_players where duel_id = ${input.id}`,
      );
      return mapDuel(row, players);
    });
  }

  public join(
    input: JoinSalaryDuelInput,
  ): Promise<{ duel: SalaryDuel; careers: readonly [CareerRecord, CareerRecord] }> {
    return this.withRuntimeRole(async (tx) => {
      const duelRows = rowsOf<DuelRow>(
        await tx`
        select * from yakyulife.salary_duels where invite_code_hash = ${input.inviteCodeHash} for update
      `,
      );
      const duel = duelRows[0];
      if (!duel || duel.status !== "pending")
        throw new ExpectedStateError("邀請碼不存在、已加入或已失效");
      if (toDate(duel.invite_expires_at) <= input.now) {
        await tx`update yakyulife.salary_duels set status = 'expired', decided_at = now(), updated_at = now() where id = ${duel.id}`;
        throw new ExpectedStateError("邀請碼已過期");
      }
      const creatorRows = rowsOf<DuelPlayerRow>(
        await tx`
        select * from yakyulife.salary_duel_players where duel_id = ${duel.id} and slot = 1 for update
      `,
      );
      const creator = creatorRows[0];
      if (!creator?.discord_user_id || !creator.player_name)
        throw new ExpectedStateError("邀請已取消");
      if (creator.discord_user_id === input.joinerUserId)
        throw new DomainError("不能加入自己建立的好友賽");
      const conflicts = rowsOf<{ id: string }>(
        await tx`
        select id from yakyulife.careers where discord_user_id in (${creator.discord_user_id}, ${input.joinerUserId}) and status = 'active'
        union all
        select duel_id as id from yakyulife.salary_duel_players
        where discord_user_id = ${input.joinerUserId} and status in ('invited', 'playing') limit 1
      `,
      );
      if (conflicts.length > 0) throw new ActiveCareerExistsError();

      const states = [
        createCareerState(
          creator.player_name,
          input.privateSeed,
          duel.engine_version,
          duel.position_group,
        ),
        createCareerState(
          input.joinerPlayerName,
          input.privateSeed,
          duel.engine_version,
          duel.position_group,
        ),
      ] as const;
      const users = [creator.discord_user_id, input.joinerUserId] as const;
      const careers: CareerRecord[] = [];
      for (let index = 0; index < 2; index += 1) {
        const state = states[index];
        const user = users[index];
        const careerId = input.careerIds[index];
        if (!state || !user || !careerId) throw new Error("Invalid duel participant state");
        const rows = rowsOf<CareerRow>(
          await tx`
          insert into yakyulife.careers (
            id, discord_user_id, status, play_mode, seed, engine_version, upstream_commit,
            state_revision, state, summary, created_at, updated_at
          ) values (
            ${careerId}, ${user}, 'active', 'dm', ${state.seed}, ${state.engineVersion},
            ${state.upstreamCommit}, 0, ${JSON.stringify(state)}::jsonb, null, ${input.now}, ${input.now}
          ) returning *
        `,
        );
        const row = rows[0];
        if (!row) throw new Error("Duel career insert returned no row");
        careers.push(mapCareer(row));
        for (const [ordinal, event] of (state.recentEvents ?? []).entries())
          await tx`
          insert into yakyulife.career_journal (
            career_id, state_revision, ordinal, game_year, player_age, category, tone, title, body
          ) values (${careerId}, 0, ${ordinal}, ${event.year}, ${event.age}, ${event.category}, ${event.tone}, ${event.title}, ${event.body})
        `;
      }
      await tx`
        update yakyulife.salary_duel_players set status = 'playing', career_id = ${input.careerIds[0]}
        where duel_id = ${duel.id} and slot = 1
      `;
      await tx`
        insert into yakyulife.salary_duel_players (
          duel_id, slot, discord_user_id, player_name, career_id, status
        ) values (${duel.id}, 2, ${input.joinerUserId}, ${input.joinerPlayerName}, ${input.careerIds[1]}, 'playing')
      `;
      const updatedRows = rowsOf<DuelRow>(
        await tx`
        update yakyulife.salary_duels set status = 'active', private_seed = ${input.privateSeed},
          seed_commitment = ${input.seedCommitment}, accepted_at = ${input.now},
          deadline_at = ${input.deadlineAt}, updated_at = ${input.now}
        where id = ${duel.id} returning *
      `,
      );
      const updated = updatedRows[0];
      if (!updated || careers.length !== 2) throw new Error("Duel activation failed");
      const players = rowsOf<DuelPlayerRow>(
        await tx`select * from yakyulife.salary_duel_players where duel_id = ${duel.id} order by slot`,
      );
      return {
        duel: mapDuel(updated, players),
        careers: careers as unknown as readonly [CareerRecord, CareerRecord],
      };
    });
  }

  public findPendingByInviteHash(inviteCodeHash: string): Promise<SalaryDuel | null> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<DuelRow>(
        await tx`
        select * from yakyulife.salary_duels
        where invite_code_hash = ${inviteCodeHash} and status = 'pending' and invite_expires_at > now()
        limit 1
      `,
      );
      const row = rows[0];
      if (!row) return null;
      const players = rowsOf<DuelPlayerRow>(
        await tx`select * from yakyulife.salary_duel_players where duel_id = ${row.id} order by slot`,
      );
      return mapDuel(row, players);
    });
  }

  public findLiveByUser(discordUserId: string): Promise<SalaryDuel | null> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<DuelRow>(
        await tx`
        select d.* from yakyulife.salary_duels d join yakyulife.salary_duel_players p on p.duel_id = d.id
        where p.discord_user_id = ${discordUserId} and d.status in ('pending', 'active') limit 1
      `,
      );
      const row = rows[0];
      if (!row) return null;
      const players = rowsOf<DuelPlayerRow>(
        await tx`select * from yakyulife.salary_duel_players where duel_id = ${row.id} order by slot`,
      );
      return mapDuel(row, players);
    });
  }

  public findLatestByUser(discordUserId: string): Promise<SalaryDuel | null> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<DuelRow>(
        await tx`
        select d.* from yakyulife.salary_duels d join yakyulife.salary_duel_players p on p.duel_id = d.id
        where p.discord_user_id = ${discordUserId}
        order by (d.status in ('pending', 'active')) desc, d.updated_at desc limit 1
      `,
      );
      const row = rows[0];
      if (!row) return null;
      const players = rowsOf<DuelPlayerRow>(
        await tx`select * from yakyulife.salary_duel_players where duel_id = ${row.id} order by slot`,
      );
      return mapDuel(row, players);
    });
  }

  public cancelPending(discordUserId: string): Promise<boolean> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<{ id: string }>(
        await tx`
        update yakyulife.salary_duels d set status = 'declined', decided_at = now(), updated_at = now()
        from yakyulife.salary_duel_players p
        where d.id = p.duel_id and p.slot = 1 and p.discord_user_id = ${discordUserId} and d.status = 'pending'
        returning d.id
      `,
      );
      if (rows.length > 0)
        await tx`
        update yakyulife.salary_duel_players set status = 'expired'
        where duel_id = ${rows[0]?.id} and status = 'invited'
      `;
      return rows.length > 0;
    });
  }

  public revealPrivateSeed(duelId: string): Promise<string | null> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<{ private_seed: string | null }>(
        await tx`
        select private_seed from yakyulife.salary_duels
        where id = ${duelId} and status in ('completed', 'forfeited', 'no_contest', 'invalid')
      `,
      );
      return rows[0]?.private_seed ?? null;
    });
  }

  public maintain(now: Date): Promise<void> {
    return this.withRuntimeRole(async (tx) => {
      await tx`select yakyulife.maintain_salary_duels(${now})`;
    });
  }

  public findUndeliveredTerminal(limit: number): Promise<SalaryDuel[]> {
    return this.withRuntimeRole(async (tx) => {
      const rows = rowsOf<DuelRow>(
        await tx`
          select d.* from yakyulife.salary_duels d
          where d.status in ('completed', 'forfeited', 'no_contest', 'invalid')
            and exists (
              select 1 from yakyulife.salary_duel_players p
              where p.duel_id = d.id and p.discord_user_id is not null
                and p.result_message_id is null
            )
          order by d.decided_at nulls last, d.updated_at
          limit ${Math.max(1, Math.min(limit, 100))}
        `,
      );
      const duels: SalaryDuel[] = [];
      for (const row of rows) {
        const players = rowsOf<DuelPlayerRow>(
          await tx`select * from yakyulife.salary_duel_players where duel_id = ${row.id} order by slot`,
        );
        duels.push(mapDuel(row, players));
      }
      return duels;
    });
  }

  public markResultDelivered(
    duelId: string,
    slot: 1 | 2,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    return this.withRuntimeRole(async (tx) => {
      await tx`
        update yakyulife.salary_duel_players
        set result_channel_id = ${channelId}, result_message_id = ${messageId}
        where duel_id = ${duelId} and slot = ${slot} and result_message_id is null
      `;
    });
  }

  private async readOne(query: Promise<unknown>): Promise<CareerRecord | null> {
    const rows = rowsOf<CareerRow>(await query);
    const row = rows[0];
    return row ? mapCareer(row) : null;
  }

  private withRuntimeRole<T>(operation: (tx: TransactionSQL) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`set local role yakyulife_runtime`;
      return operation(tx);
    });
  }
}
