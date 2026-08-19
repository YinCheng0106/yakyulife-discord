import { describe, expect, test } from "bun:test";
import {
  type CareerHistory,
  type CareerRecord,
  createCareerState,
  type SalaryDuel,
} from "@yakyulife/core";
import {
  ATTRIBUTION,
  careerCommands,
  createShareCardViewModel,
  parseHistoryCustomId,
  registeredCommandDefinitions,
  renderCareer,
  renderCareerHistory,
  renderCareerShare,
  shareCardFilename,
  sharpShareCardRenderer,
  toHistoryCustomId,
} from "@yakyulife/discord";
import sharp from "sharp";
import { runCareer } from "../helpers/simulation.ts";

function record(state = createCareerState("畫面投手", "render")): CareerRecord {
  return {
    id: "91d4450c-f536-4a46-a704-02049ba5c321",
    discordUserId: "123",
    status: state.summary ? "completed" : "active",
    playMode: "channel",
    location: { guildId: "guild", channelId: "channel", messageId: null },
    seed: state.seed,
    engineVersion: state.engineVersion,
    upstreamCommit: state.upstreamCommit,
    stateRevision: 0,
    state,
    summary: state.summary,
    createdAt: new Date("2026-08-12T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    completedAt: state.summary ? new Date("2026-08-12T00:00:00.000Z") : null,
  };
}

describe("Discord rendering", () => {
  test("uses an explicit command registry for the career command", () => {
    expect(registeredCommandDefinitions).toHaveLength(1);
    expect(registeredCommandDefinitions[0]?.name).toBe("career");
    expect([...registeredCommandDefinitions]).toEqual([...careerCommands]);
  });

  test("renders a Components V2 career screen with attribution", () => {
    const message = renderCareer(record());
    expect(message.components).toHaveLength(1);
    expect(JSON.stringify(message.components)).toContain("Revision 0");
    expect(JSON.stringify(message.components)).toContain("LeoGGcat");
    expect(message.allowedMentions).toEqual({ parse: [] });
    expect(JSON.stringify(message.components)).toContain("最高球探分級");
    expect(JSON.stringify(message.components)).not.toContain("internalRating");
  });

  test("renders a PNG share card", async () => {
    const completed = runCareer(createCareerState("分享投手", "share-card")).state;
    const png = await sharpShareCardRenderer.render(record(completed));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.byteLength).toBeGreaterThan(10_000);
    expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 1600, format: "png" });
    if (!completed.summary) throw new Error("Expected a completed career summary");
    expect(createShareCardViewModel(completed.summary).totalEarnings).toContain("萬");
    expect(ATTRIBUTION).toContain("CC BY-NC 4.0");
  });

  test("renders a private salary duel result poster after the seed is revealed", async () => {
    const duel: SalaryDuel = {
      id: "duel-card",
      status: "completed",
      positionGroup: "catcher",
      engineVersion: "0.4.0",
      rulesetVersion: "salary-duel-v1",
      seedCommitment: "commitment",
      revealedSeed: "revealed-private-seed",
      winnerSlot: 2,
      outcomeReason: "score",
      inviteExpiresAt: new Date("2026-08-14T00:00:00.000Z"),
      deadlineAt: new Date("2026-08-20T00:00:00.000Z"),
      players: [
        {
          duelId: "duel-card",
          slot: 1,
          discordUserId: "1",
          playerName: "先發捕手",
          careerId: "career-1",
          status: "completed",
          totalEarnings: 12_000,
          peakAnnualSalary: 1_200,
          lastAnnualSalary: 900,
          finalStateHash: "hash-1",
          resultChannelId: null,
          resultMessageId: null,
          finishedAt: new Date(),
        },
        {
          duelId: "duel-card",
          slot: 2,
          discordUserId: "2",
          playerName: "鐵捕",
          careerId: "career-2",
          status: "completed",
          totalEarnings: 13_500,
          peakAnnualSalary: 1_400,
          lastAnnualSalary: 1_000,
          finalStateHash: "hash-2",
          resultChannelId: null,
          resultMessageId: null,
          finishedAt: new Date(),
        },
      ],
    };
    const png = await sharpShareCardRenderer.renderDuel(duel);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 1600 });
    expect(png.byteLength).toBeLessThan(5 * 1024 * 1024);
  });

  test("renders clear family priorities and salary in the main container", () => {
    const career = record();
    career.state.stage = "professional";
    career.state.contract.annualSalary = 600;
    career.state.contract.yearsRemaining = 2;
    career.state.contract.totalEarnings = 1_800;
    career.state.pending = { type: "life", eventId: "anniversary" };
    const rendered = JSON.stringify(renderCareer(career).components);
    expect(rendered).toContain("家庭還是比較重要");
    expect(rendered).toContain("棒球還是比較重要");
    expect(rendered).toContain("年薪 600 萬");
    expect(rendered).toContain("生涯收入 1,800 萬");
  });

  test("renders attached share cards inside Components V2 media galleries", () => {
    const career = record();
    const filename = shareCardFilename(career.id);
    const message = renderCareerShare(filename, career.state.name);
    expect(JSON.stringify(message.components)).toContain(`attachment://${filename}`);
  });

  test("renders an owned career history page with safe pagination IDs", () => {
    const career = record();
    const history: CareerHistory = {
      career,
      years: [2026],
      entries: [
        {
          careerId: career.id,
          stateRevision: 0,
          ordinal: 0,
          year: 2026,
          age: 16,
          category: "career",
          tone: "good",
          title: "球員誕生",
          body: "從高中開始投手生涯。",
          createdAt: career.createdAt,
        },
        {
          careerId: career.id,
          stateRevision: 1,
          ordinal: 0,
          year: 2026,
          age: 16,
          category: "training",
          tone: "neutral",
          title: "訓練骰暫存",
          body: "不應顯示的暫存事件。",
          createdAt: career.createdAt,
        },
      ],
    };
    const message = renderCareerHistory(history, 0);
    expect(JSON.stringify(message.components)).toContain("生涯年表");
    expect(JSON.stringify(message.components)).toContain("球員誕生");
    expect(JSON.stringify(message.components)).not.toContain("不應顯示的暫存事件");
    const customIds = JSON.stringify(message.components).match(/career-history:[^"]+/g) ?? [];
    expect(new Set(customIds).size).toBe(customIds.length);
    const customId = toHistoryCustomId(career.id, 0);
    expect(parseHistoryCustomId(customId)).toEqual({ careerId: career.id, page: 0 });
    expect(parseHistoryCustomId(`career-history:${career.id}:0`)).toEqual({
      careerId: career.id,
      page: 0,
    });
  });

  test("shows a completed career share card on the latest history page", () => {
    const completed = runCareer(createCareerState("年表分享", "history-share")).state;
    const career = record(completed);
    const history: CareerHistory = {
      career,
      years: [completed.year],
      entries: [],
    };
    const filename = shareCardFilename(career.id);
    const message = renderCareerHistory(history, 0, filename);
    expect(JSON.stringify(message.components)).toContain(`attachment://${filename}`);
  });

  test("hides stats for a season lost to TJ rehab or a major injury", () => {
    const career = record();
    career.state.seasons = [
      {
        year: 2026,
        age: 16,
        level: "cpbl1",
        team: "台中猛瑪",
        role: "starter",
        games: 12,
        starts: 10,
        wins: 1,
        losses: 4,
        saves: 0,
        holds: 0,
        innings: 28,
        strikeouts: 20,
        earnedRuns: 14,
        era: 4.5,
        whip: 1.4,
        injured: "major",
        awards: [],
      },
    ];
    const history: CareerHistory = { career, years: [2026], entries: [] };
    const rendered = JSON.stringify(renderCareerHistory(history, 0).components);
    expect(rendered).toContain("賽季報銷，不列出該球季戰績資訊");
    expect(rendered).not.toContain("28 局");
    expect(rendered).not.toContain("ERA 4.5");
  });
});
