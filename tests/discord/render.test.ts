import { describe, expect, test } from "bun:test";
import { type CareerHistory, type CareerRecord, createCareerState } from "@yakyulife/core";
import {
  ATTRIBUTION,
  parseHistoryCustomId,
  renderCareer,
  renderCareerHistory,
  renderCareerShare,
  shareCardFilename,
  sharpShareCardRenderer,
  toHistoryCustomId,
} from "@yakyulife/discord";
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
  test("renders a Components V2 career screen with attribution", () => {
    const message = renderCareer(record());
    expect(message.components).toHaveLength(1);
    expect(JSON.stringify(message.components)).toContain("Revision 0");
    expect(JSON.stringify(message.components)).toContain("LeoGGcat");
    expect(message.allowedMentions).toEqual({ parse: [] });
  });

  test("renders a PNG share card", async () => {
    const completed = runCareer(createCareerState("分享投手", "share-card")).state;
    const png = await sharpShareCardRenderer.render(record(completed));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.byteLength).toBeGreaterThan(10_000);
    expect(ATTRIBUTION).toContain("CC BY-NC 4.0");
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
