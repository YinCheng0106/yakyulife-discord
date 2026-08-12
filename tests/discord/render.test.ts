import { describe, expect, test } from "bun:test";
import { type CareerRecord, createCareerState } from "@yakyulife/core";
import { ATTRIBUTION, renderCareer, sharpShareCardRenderer } from "@yakyulife/discord";
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
});
