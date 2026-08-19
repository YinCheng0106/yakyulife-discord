import { describe, expect, test } from "bun:test";
import { createCareerState, LEGACY_ENGINE_VERSION } from "@yakyulife/core";
import { parseCareerState } from "@yakyulife/postgres";

describe("persisted state boundary", () => {
  test("accepts a complete engine state", () => {
    const state = createCareerState("邊界測試", "state-v1");
    expect(parseCareerState(structuredClone(state))).toEqual(state);
  });

  test("accepts Bun.SQL JSONB string results", () => {
    const state = createCareerState("字串邊界", "jsonb-string");
    expect(parseCareerState(JSON.stringify(state))).toEqual(state);
  });

  test("fills scouting defaults for current development states", () => {
    const state = createCareerState("開發中狀態", "schema-four-default");
    delete state.scouting;
    const parsed = parseCareerState(state);
    expect(parsed.scouting?.exposure).toBe(0);
    expect(parsed.scouting?.markets.cpbl.tier).toBe("unseen");
    expect(parsed.scouting?.reports).toEqual([]);
  });

  test("requires the content fingerprint for v0.5 states", () => {
    const state = createCareerState("內容邊界", "content-boundary");
    const missingHash = { ...state };
    delete missingHash.contentHash;
    expect(() => parseCareerState(missingHash)).toThrow("structure is invalid");
  });

  test("continues accepting legacy state without modern life fields", () => {
    const state = createCareerState("舊版邊界", "state-v1", LEGACY_ENGINE_VERSION);
    expect(parseCareerState(structuredClone(state))).toEqual(state);
  });

  test("rejects malformed JSON before it reaches the engine", () => {
    const state = createCareerState("邊界測試", "broken");
    const malformed = { ...state, abilities: { ...state.abilities, velocity: "fast" } };
    expect(() => parseCareerState(malformed)).toThrow("structure is invalid");
  });

  test("rejects an invalid JSON string", () => {
    expect(() => parseCareerState("{not-json}")).toThrow("contains invalid JSON");
  });
});
