import { describe, expect, test } from "bun:test";
import { actionFromKey, parseCareerCustomId, toCustomId } from "./actions.ts";

describe("career component IDs", () => {
  test("contains only career id, revision and action key", () => {
    const careerId = "91d4450c-f536-4a46-a704-02049ba5c321";
    const value = toCustomId(careerId, 7, "event_bold");
    expect(parseCareerCustomId(value)).toEqual({ careerId, revision: 7, actionKey: "event_bold" });
    expect(actionFromKey("event_bold")).toEqual({ type: "choose_event", strategy: "bold" });
    expect(actionFromKey("die_control")).toEqual({
      type: "assign_training_die",
      ability: "control",
    });
    expect(actionFromKey("training_undo")).toEqual({ type: "undo_training_die" });
    expect(actionFromKey("training_confirm")).toEqual({ type: "confirm_training" });
    expect(actionFromKey("abl_accept")).toEqual({ type: "choose_abl", choice: "accept" });
    expect(actionFromKey("international_accept")).toEqual({
      type: "choose_international",
      choice: "accept",
    });
  });

  test("rejects malformed values", () => {
    expect(parseCareerCustomId("career:owner:full-state")).toBeNull();
    expect(actionFromKey("unknown")).toBeNull();
  });
});
