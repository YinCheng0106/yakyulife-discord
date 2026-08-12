import { describe, expect, test } from "bun:test";
import { actionFromKey, parseCareerCustomId, toCustomId } from "./actions.ts";

describe("career component IDs", () => {
  test("contains only career id, revision and action key", () => {
    const careerId = "91d4450c-f536-4a46-a704-02049ba5c321";
    const value = toCustomId(careerId, 7, "event_bold");
    expect(parseCareerCustomId(value)).toEqual({ careerId, revision: 7, actionKey: "event_bold" });
    expect(actionFromKey("event_bold")).toEqual({ type: "choose_event", strategy: "bold" });
  });

  test("rejects malformed values", () => {
    expect(parseCareerCustomId("career:owner:full-state")).toBeNull();
    expect(actionFromKey("unknown")).toBeNull();
  });
});
