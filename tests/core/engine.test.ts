import { describe, expect, test } from "bun:test";
import { createCareerState, type GameAction, reduceCareer } from "@yakyulife/core";
import golden from "../../packages/core/test-fixtures/golden-v1.json" with { type: "json" };

describe("career engine", () => {
  test("same seed and action produce exactly the same result", () => {
    const left = createCareerState("測試投手", "golden-seed");
    const right = createCareerState("測試投手", "golden-seed");
    expect(left).toEqual(right);
    const action = {
      type: "allocate_training",
      primary: "velocity",
      secondary: "control",
    } as const;
    expect(reduceCareer(left, action)).toEqual(reduceCareer(right, action));
  });

  test("matches the versioned golden fixture", () => {
    let state = createCareerState("黃金投手", golden.seed);
    for (const action of golden.actions as GameAction[]) state = reduceCareer(state, action).state;
    const digest = new Bun.CryptoHasher("sha256").update(JSON.stringify(state)).digest("hex");
    expect(state.engineVersion).toBe(golden.engineVersion);
    expect(digest).toBe(golden.stateSha256);
  });

  test("reducer does not mutate its input", () => {
    const state = createCareerState("純函式", "immutable");
    const snapshot = structuredClone(state);
    reduceCareer(state, { type: "allocate_training", primary: "velocity", secondary: "breaking" });
    expect(state).toEqual(snapshot);
  });

  test("rejects an invalid training allocation", () => {
    const state = createCareerState("錯誤測試", "invalid");
    expect(() =>
      reduceCareer(state, {
        type: "allocate_training",
        primary: "velocity",
        secondary: "velocity",
      }),
    ).toThrow("不可相同");
  });
});
