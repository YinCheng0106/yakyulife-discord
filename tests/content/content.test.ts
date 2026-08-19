import { describe, expect, test } from "bun:test";
import {
  CONTENT_PACK_HASH,
  CONTENT_PACK_VERSION,
  contentPack,
  parseContentEvents,
  parseContentTeams,
} from "@yakyulife/content";

describe("content pack", () => {
  test("ships thirty MLB teams in six complete divisions", () => {
    expect(contentPack.teams.leagues.mlb).toHaveLength(30);
    expect(Object.values(contentPack.teams.mlbDivisions)).toHaveLength(6);
    expect(
      Object.values(contentPack.teams.mlbDivisions).every((division) => division.length === 5),
    ).toBe(true);
    expect(new Set(Object.values(contentPack.teams.mlbDivisions).flat())).toEqual(
      new Set(contentPack.teams.leagues.mlb),
    );
  });

  test("rejects duplicate event IDs and unsafe effect kinds", () => {
    const event = contentPack.events[0];
    expect(() =>
      parseContentEvents({ version: CONTENT_PACK_VERSION, events: [event, event] }),
    ).toThrow();
    expect(() =>
      parseContentEvents({
        version: CONTENT_PACK_VERSION,
        events: [{ ...event, effects: ["run_javascript"] }],
      }),
    ).toThrow();
  });

  test("rejects incomplete MLB divisions", () => {
    expect(() =>
      parseContentTeams({
        ...contentPack.teams,
        mlbDivisions: { al_east: contentPack.teams.leagues.mlb.slice(0, 5) },
      }),
    ).toThrow();
  });

  test("has a deterministic non-empty content hash", () => {
    expect(CONTENT_PACK_HASH).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});
