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
  DomainError,
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

export class PostgresCareerRepository implements CareerRepository {
  public constructor(private readonly sql: SQL) {}

  public async create(career: CareerRecord): Promise<CareerRecord> {
    try {
      return await this.withRuntimeRole(async (tx) => {
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
    const rows = await this.withRuntimeRole(async (tx) =>
      rowsOf<{ id: string }>(
        await tx`
        update yakyulife.careers set status = 'abandoned', updated_at = now()
        where id = ${careerId} and discord_user_id = ${discordUserId} and status = 'active'
        returning id
      `,
      ),
    );
    return rows.length > 0;
  }

  public async deleteByUser(discordUserId: string): Promise<number> {
    const rows = await this.withRuntimeRole(async (tx) =>
      rowsOf<{ id: string }>(
        await tx`
        delete from yakyulife.careers where discord_user_id = ${discordUserId} returning id
      `,
      ),
    );
    return rows.length;
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
