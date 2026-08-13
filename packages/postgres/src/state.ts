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
      (value.points === undefined || isFiniteNumber(value.points)) &&
      Array.isArray(value.dice) &&
      value.dice.every(isFiniteNumber) &&
      (value.assignments === undefined ||
        (Array.isArray(value.assignments) &&
          value.assignments.every((item) =>
            ["stamina", "velocity", "control", "breaking"].includes(String(item)),
          )))
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
          (offer.kind === "long" || offer.kind === "short" || offer.kind === "overseas") &&
          isFiniteNumber(offer.years) &&
          isFiniteNumber(offer.salary),
      )
    );
  }
  if (value.type === "life")
    return ["dating", "proposal", "anniversary", "temptation", "reconcile"].includes(
      String(value.eventId),
    );
  if (value.type === "abl")
    return (
      typeof value.team === "string" && (value.mode === "offseason" || value.mode === "contract")
    );
  if (value.type === "international")
    return (
      (value.tournament === "世界棒球經典賽" || value.tournament === "世界12強賽") &&
      typeof value.forced === "boolean"
    );
  return false;
}

function validEngineEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.year) &&
    isFiniteNumber(value.age) &&
    typeof value.category === "string" &&
    typeof value.tone === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string"
  );
}

function validLife(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["single", "dating", "married", "divorced"].includes(String(value.status)) &&
    (value.partner === null || typeof value.partner === "string") &&
    hasFiniteNumbers(value, [
      "datingYears",
      "marriedYears",
      "children",
      "affairs",
      "caughtAffairs",
    ]) &&
    isStringArray(value.formerPartners)
  );
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
    !isStringArray(decoded.traits) ||
    !(
      decoded.leagueTotals === undefined ||
      (Array.isArray(decoded.leagueTotals) &&
        decoded.leagueTotals.every(
          (total) =>
            isRecord(total) &&
            typeof total.league === "string" &&
            hasFiniteNumbers(total, ["seasons", "games", "innings", "wins", "saves", "strikeouts"]),
        ))
    ) ||
    !(
      decoded.family === undefined ||
      (isRecord(decoded.family) &&
        ["single", "dating", "married", "divorced"].includes(String(decoded.family.status)) &&
        (decoded.family.partner === null || typeof decoded.family.partner === "string") &&
        isFiniteNumber(decoded.family.children))
    )
  ) {
    throw new Error("Career summary is invalid");
  }
  return decoded as unknown as CareerSummary;
}

export function migrateCareerState(value: unknown): CareerState {
  const decoded = decodeJsonValue(value, "Career state");
  if (!isRecord(decoded)) throw new Error("Career state must be an object");
  if (![1, 2, STATE_SCHEMA_VERSION].includes(Number(decoded.schemaVersion))) {
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
    validPending(decoded.pending) &&
    (decoded.schemaVersion === 1 ||
      (validLife(decoded.life) &&
        isFiniteNumber(decoded.offseasonFatigue) &&
        Array.isArray(decoded.recentEvents) &&
        decoded.recentEvents.every(validEngineEvent)));
  if (!valid) throw new Error("Career state structure is invalid");
  parseCareerSummary(decoded.summary);
  return decoded as unknown as CareerState;
}

export const parseCareerState = migrateCareerState;
