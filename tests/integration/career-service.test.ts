import { describe, expect, test } from "bun:test";
import { CareerService, type Clock, type IdGenerator } from "@yakyulife/core";
import { InMemoryCareerRepository } from "../helpers/in-memory-repository.ts";

const clock: Clock = { now: () => new Date("2026-08-12T00:00:00.000Z") };
const ids: IdGenerator = { next: () => "91d4450c-f536-4a46-a704-02049ba5c321" };

describe("career service integration", () => {
  test("persists an action once and rejects stale revisions", async () => {
    const repository = new InMemoryCareerRepository();
    const service = new CareerService(repository, clock, ids);
    const career = await service.start({
      discordUserId: "123",
      name: "測試投手",
      seed: "transaction",
      playMode: "dm",
      location: { guildId: null, channelId: null, messageId: null },
    });
    const input = {
      careerId: career.id,
      discordUserId: "123",
      interactionId: "interaction-1",
      expectedRevision: 0,
      action: { type: "allocate_training", primary: "velocity", secondary: "control" } as const,
    };
    const applied = await service.applyAction(input);
    expect(applied.status).toBe("applied");
    const duplicate = await service.applyAction(input);
    expect(duplicate.status).toBe("duplicate");
    const stale = await service.applyAction({ ...input, interactionId: "interaction-2" });
    expect(stale.status).toBe("stale");
  });

  test("prevents a second active career", async () => {
    const service = new CareerService(new InMemoryCareerRepository(), clock, ids);
    const input = {
      discordUserId: "456",
      name: "唯一生涯",
      seed: "single",
      playMode: "channel" as const,
      location: { guildId: "g", channelId: "c", messageId: null },
    };
    await service.start(input);
    expect(service.start(input)).rejects.toThrow("已有進行中的生涯");
  });
});
