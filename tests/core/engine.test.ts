import { describe, expect, test } from "bun:test";
import {
  createCareerState,
  type GameAction,
  LEAGUE_RULES,
  LEGACY_ENGINE_VERSION,
  LEVEL_LABELS,
  reduceCareer,
} from "@yakyulife/core";
import golden from "../../packages/core/test-fixtures/golden-v1.json" with { type: "json" };

describe("career engine", () => {
  test("same seed and action produce exactly the same result", () => {
    const left = createCareerState("測試投手", "golden-seed");
    const right = createCareerState("測試投手", "golden-seed");
    expect(left).toEqual(right);
    const action = { type: "assign_training_die", ability: "velocity" } as const;
    expect(reduceCareer(left, action)).toEqual(reduceCareer(right, action));
  });

  test("matches the versioned golden fixture", () => {
    let state = createCareerState("黃金投手", golden.seed, LEGACY_ENGINE_VERSION);
    for (const action of golden.actions as GameAction[]) state = reduceCareer(state, action).state;
    const digest = new Bun.CryptoHasher("sha256").update(JSON.stringify(state)).digest("hex");
    expect(state.engineVersion).toBe(golden.engineVersion);
    expect(digest).toBe(golden.stateSha256);
  });

  test("reducer does not mutate its input", () => {
    const state = createCareerState("純函式", "immutable");
    const snapshot = structuredClone(state);
    reduceCareer(state, { type: "assign_training_die", ability: "velocity" });
    expect(state).toEqual(snapshot);
  });

  test("rejects an invalid training allocation", () => {
    const state = createCareerState("錯誤測試", "invalid", LEGACY_ENGINE_VERSION);
    expect(() =>
      reduceCareer(state, {
        type: "allocate_training",
        primary: "velocity",
        secondary: "velocity",
      }),
    ).toThrow("不可相同");
  });

  test("assigns dice independently, supports undo, and applies only on confirmation", () => {
    let state = createCareerState("逐骰投手", "per-die");
    const initialAbilities = structuredClone(state.abilities);
    const dice = state.pending?.type === "training" ? [...state.pending.dice] : [];
    expect(dice.length).toBeGreaterThanOrEqual(3);

    state = reduceCareer(state, { type: "assign_training_die", ability: "control" }).state;
    expect(state.abilities).toEqual(initialAbilities);
    expect(state.pending?.type === "training" ? state.pending.assignments : []).toEqual([
      "control",
    ]);

    state = reduceCareer(state, { type: "undo_training_die" }).state;
    expect(state.pending?.type === "training" ? state.pending.assignments : []).toEqual([]);
    for (let index = 0; index < dice.length; index += 1)
      state = reduceCareer(state, { type: "assign_training_die", ability: "control" }).state;
    const confirmed = reduceCareer(state, { type: "confirm_training" });
    expect(confirmed.state.abilities.control).toBeGreaterThan(initialAbilities.control);
    expect(confirmed.state.pending?.type).toBe("event");
    expect(confirmed.events.some((event) => event.category === "training")).toBe(true);
  });

  test("does not persist temporary training allocations as annual events", () => {
    const state = createCareerState("暫存測試", "temporary-training");
    const assigned = reduceCareer(state, { type: "assign_training_die", ability: "control" });
    expect(assigned.state.lastOutcome.some((message) => message.includes("訓練骰暫存"))).toBe(true);
    expect(assigned.events).toEqual([]);

    const undone = reduceCareer(assigned.state, { type: "undo_training_die" });
    expect(undone.events).toEqual([]);
  });

  test("defines the complete American minor-league ladder", () => {
    const levels = ["rookie", "a", "high_a", "aa", "aaa"] as const;
    expect(levels.map((level) => LEVEL_LABELS[level])).toEqual([
      "美職新人聯盟",
      "美職 1A",
      "美職高階 1A",
      "美職 2A",
      "美職 3A",
    ]);
    expect(LEAGUE_RULES.rookie.promotionOverall).toBeLessThan(
      LEAGUE_RULES.aaa.promotionOverall ?? Number.POSITIVE_INFINITY,
    );
    expect(LEAGUE_RULES.aaa.demotionOverall).toBe(48);
  });

  test("records Australian offseason appearances without advancing age", () => {
    const state = createCareerState("澳職投手", "abl-offseason");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.contract.yearsRemaining = 2;
    state.pending = { type: "abl", team: "雪梨灣鯊", mode: "offseason" };
    const age = state.age;
    const result = reduceCareer(state, { type: "choose_abl", choice: "accept" });
    const appearance = result.state.seasons.find((season) => season.engagement === "offseason");
    expect(appearance?.league).toBe("abl");
    expect(appearance?.team).toBe("雪梨灣鯊");
    expect(result.state.age).toBe(age + 1);
    expect(appearance?.age).toBe(age);
  });

  test("persists relationship choices and their consequences", () => {
    const state = createCareerState("人生投手", "life-event");
    state.stage = "professional";
    state.pending = { type: "life", eventId: "dating" };
    const result = reduceCareer(state, { type: "choose_life", choice: "accept" });
    expect(result.state.life?.status).toBe("dating");
    expect(result.state.life?.partner).not.toBeNull();
    expect(result.events.some((event) => event.category === "life")).toBe(true);
  });

  test("supports a full Korean league contract destination", () => {
    const state = createCareerState("韓職投手", "kbo-contract");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.pending = {
      type: "contract",
      offers: [
        {
          id: "overseas",
          kind: "overseas",
          years: 3,
          salary: 2_400,
          level: "kbo1",
          team: "首爾彗星",
        },
      ],
    };
    const result = reduceCareer(state, { type: "choose_contract", choice: "overseas" });
    expect(result.state.level).toBe("kbo1");
    expect(result.state.team).toBe("首爾彗星");
    expect(result.state.contract.yearsRemaining).toBe(3);
  });

  test("labels a contract from an overseas league back to CPBL as a return contract", () => {
    const state = createCareerState("返台投手", "return-contract");
    state.stage = "professional";
    state.level = "npb1";
    state.team = "東京白鷺";
    state.pending = {
      type: "contract",
      offers: [
        {
          id: "overseas",
          kind: "overseas",
          years: 2,
          salary: 1_200,
          level: "cpbl1",
          team: "台中猛瑪",
          source: "fa",
        },
      ],
    };
    const result = reduceCareer(state, { type: "choose_contract", choice: "overseas" });
    expect(result.events.some((event) => event.body.includes("返台合約"))).toBe(true);
    expect(result.events.some((event) => event.body.includes("海外合約"))).toBe(false);
  });

  test("records international appearances separately from the primary league", () => {
    const state = createCareerState("國手投手", "international");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.contract.yearsRemaining = 2;
    state.pending = {
      type: "international",
      tournament: "世界棒球經典賽",
      forced: false,
    };
    const result = reduceCareer(state, { type: "choose_international", choice: "accept" });
    const appearance = result.state.seasons.find((season) => season.league === "international");
    expect(appearance?.team).toBe("中華隊");
    expect(appearance?.engagement).toBe("offseason");
    expect(["cpbl1", "cpbl2"]).toContain(result.state.level);
  });
});
