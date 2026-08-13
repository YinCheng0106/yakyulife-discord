import { describe, expect, test } from "bun:test";
import {
  CareerService,
  type Clock,
  type IdGenerator,
  LEGACY_ENGINE_VERSION,
} from "@yakyulife/core";
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
      action: { type: "assign_training_die", ability: "velocity" } as const,
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

  test("lists owned careers and returns structured history", async () => {
    const service = new CareerService(new InMemoryCareerRepository(), clock, ids);
    const career = await service.start({
      discordUserId: "history-user",
      name: "年表投手",
      seed: "history",
      playMode: "dm",
      location: { guildId: null, channelId: null, messageId: null },
    });
    await service.applyAction({
      careerId: career.id,
      discordUserId: "history-user",
      interactionId: "history-action",
      expectedRevision: 0,
      action: { type: "assign_training_die", ability: "control" },
    });
    const list = await service.listCareers("history-user");
    const history = await service.getHistory("history-user", career.id);
    expect(list[0]?.name).toBe("年表投手");
    expect(history?.entries.some((entry) => entry.title === "訓練骰暫存")).toBe(false);
    expect(await service.getHistory("other-user", career.id)).toBeNull();
  });

  test("can keep creating legacy careers during a staged rollout", async () => {
    const service = new CareerService(
      new InMemoryCareerRepository(),
      clock,
      ids,
      LEGACY_ENGINE_VERSION,
    );
    const career = await service.start({
      discordUserId: "legacy-user",
      name: "舊版投手",
      seed: "legacy",
      playMode: "dm",
      location: { guildId: null, channelId: null, messageId: null },
    });
    expect(career.engineVersion).toBe(LEGACY_ENGINE_VERSION);
    expect(career.state.pending?.type === "training" && career.state.pending.points).toBeNumber();
  });
});
