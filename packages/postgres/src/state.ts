import { type CareerState, type CareerSummary, STATE_SCHEMA_VERSION } from "@yakyulife/core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeJsonValue(value: unknown, label: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} contains invalid JSON`);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasFiniteNumbers(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && keys.every((key) => isFiniteNumber(value[key]));
}

function hasBooleans(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && keys.every((key) => typeof value[key] === "boolean");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validPending(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "training") {
    return (
      isFiniteNumber(value.points) && Array.isArray(value.dice) && value.dice.every(isFiniteNumber)
    );
  }
  if (value.type === "event") return typeof value.eventId === "string";
  if (value.type === "pitch_effort" || value.type === "tj" || value.type === "career") return true;
  if (value.type === "draft") {
    return (
      typeof value.canContinueSchool === "boolean" &&
      (value.schoolLabel === null ||
        value.schoolLabel === "university" ||
        value.schoolLabel === "remain_university")
    );
  }
  if (value.type === "contract") {
    return (
      Array.isArray(value.offers) &&
      value.offers.every(
        (offer) =>
          isRecord(offer) &&
          (offer.kind === "long" || offer.kind === "short") &&
          isFiniteNumber(offer.years) &&
          isFiniteNumber(offer.salary),
      )
    );
  }
  return false;
}

function validSeason(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasFiniteNumbers(value, [
      "year",
      "age",
      "games",
      "starts",
      "wins",
      "losses",
      "saves",
      "holds",
      "innings",
      "strikeouts",
      "earnedRuns",
      "era",
      "whip",
    ]) &&
    typeof value.level === "string" &&
    typeof value.team === "string" &&
    typeof value.role === "string" &&
    typeof value.injured === "string" &&
    isStringArray(value.awards)
  );
}

export function parseCareerSummary(value: unknown): CareerSummary | null {
  const decoded = decodeJsonValue(value, "Career summary");
  if (decoded === null) return null;
  if (
    !isRecord(decoded) ||
    typeof decoded.name !== "string" ||
    typeof decoded.ending !== "string" ||
    typeof decoded.seed !== "string" ||
    typeof decoded.engineVersion !== "string" ||
    !hasFiniteNumbers(decoded, [
      "finalAge",
      "seasons",
      "careerWins",
      "careerSaves",
      "careerStrikeouts",
      "careerInnings",
      "totalEarnings",
    ]) ||
    !(decoded.bestEra === null || isFiniteNumber(decoded.bestEra)) ||
    !isStringArray(decoded.honors) ||
    !isStringArray(decoded.traits)
  ) {
    throw new Error("Career summary is invalid");
  }
  return decoded as unknown as CareerSummary;
}

export function migrateCareerState(value: unknown): CareerState {
  const decoded = decodeJsonValue(value, "Career state");
  if (!isRecord(decoded)) throw new Error("Career state must be an object");
  if (decoded.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported career state schema: ${String(decoded.schemaVersion)}`);
  }
  const valid =
    typeof decoded.engineVersion === "string" &&
    typeof decoded.upstreamCommit === "string" &&
    typeof decoded.seed === "string" &&
    typeof decoded.name === "string" &&
    isFiniteNumber(decoded.rngState) &&
    hasFiniteNumbers(decoded, ["age", "year", "stageYear"]) &&
    typeof decoded.stage === "string" &&
    typeof decoded.level === "string" &&
    typeof decoded.team === "string" &&
    typeof decoded.role === "string" &&
    typeof decoded.pitchEffort === "string" &&
    hasFiniteNumbers(decoded.abilities, ["stamina", "velocity", "control", "breaking"]) &&
    hasFiniteNumbers(decoded.potential, ["stamina", "velocity", "control", "breaking"]) &&
    hasFiniteNumbers(decoded.trainingCarry, ["stamina", "velocity", "control", "breaking"]) &&
    hasBooleans(decoded.traits, [
      "genius",
      "fragile",
      "iron_man",
      "late_bloomer",
      "disciplined",
      "clutch",
      "rubber_arm",
    ]) &&
    hasFiniteNumbers(decoded.counters, [
      "sixesBefore22",
      "conservativeChoices",
      "boldSuccesses",
      "majorInjuries",
      "healthySeasons",
      "successfulInjections",
    ]) &&
    hasFiniteNumbers(decoded.contract, [
      "annualSalary",
      "yearsRemaining",
      "serviceYears",
      "totalEarnings",
    ]) &&
    hasFiniteNumbers(decoded.injury, ["rehabSeasons", "temporaryPenalty", "tjLoad", "tjCount"]) &&
    Array.isArray(decoded.seasons) &&
    decoded.seasons.every(validSeason) &&
    isStringArray(decoded.honors) &&
    isStringArray(decoded.lastOutcome) &&
    validPending(decoded.pending);
  if (!valid) throw new Error("Career state structure is invalid");
  parseCareerSummary(decoded.summary);
  return decoded as unknown as CareerState;
}

export const parseCareerState = migrateCareerState;
