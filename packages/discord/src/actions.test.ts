import { describe, expect, test } from "bun:test";
import { ActiveCareerExistsError, DomainError, ExpectedStateError } from "@yakyulife/core";
import { actionFromKey, parseCareerCustomId, toCustomId } from "./actions.ts";
import { careerErrorSeverity } from "./feature.ts";

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

  test("maps v0.4 hitter training and FA actions", () => {
    expect(actionFromKey("die_contact")).toEqual({
      type: "assign_training_die",
      ability: "contact",
    });
    expect(actionFromKey("die_calling")).toEqual({
      type: "assign_training_die",
      ability: "calling",
    });
    expect(actionFromKey("fa_market")).toEqual({ type: "choose_free_agency", choice: "market" });
    expect(actionFromKey("fa_home")).toEqual({ type: "choose_free_agency", choice: "home" });
  });

  test("classifies expected product rejections without error logging", () => {
    expect(careerErrorSeverity(new ActiveCareerExistsError())).toBe("info");
    expect(careerErrorSeverity(new ExpectedStateError("邀請已過期"))).toBe("info");
    expect(careerErrorSeverity(new DomainError("stale"))).toBe("warn");
    expect(careerErrorSeverity(new Error("database"))).toBe("error");
  });
});
