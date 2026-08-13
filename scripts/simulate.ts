import { createCareerState, type PositionGroup } from "@yakyulife/core";
import { assertFiniteTree, runCareer } from "../tests/helpers/simulation.ts";
import { createScriptLogger } from "./logger.ts";

const logger = createScriptLogger("SIMULATION");

const count = Number(process.env.SIMULATION_COUNT ?? "10000");
if (!Number.isInteger(count) || count < 1)
  throw new Error("SIMULATION_COUNT must be a positive integer");
const positionGroups: readonly PositionGroup[] = ["pitcher", "catcher", "infielder", "outfielder"];
const reports = [];
for (const positionGroup of positionGroups) {
  const actionCounts: number[] = [];
  const earnings: number[] = [];
  let professionalCareers = 0;
  let amateurClubCareers = 0;
  const entryLeagues = { cpbl: 0, npb: 0, mlb: 0, none: 0 };
  const entryRoutes = { highSchool: 0, university: 0, amateurClub: 0, noProfessional: 0 };
  const maximumScoutingRating = { cpbl: 0, npb: 0, mlb: 0 };
  for (let index = 0; index < count; index += 1) {
    const result = runCareer(
      createCareerState(
        `${positionGroup}-${index}`,
        `simulation-${positionGroup}-${index}`,
        undefined,
        positionGroup,
      ),
      300,
    );
    assertFiniteTree(result.state);
    if (!result.state.summary) throw new Error(`Career did not finish: ${positionGroup}-${index}`);
    if (result.state.summary.seasons > 0) professionalCareers += 1;
    if (
      result.state.seasons.some(
        (season) => season.level === "amateur" && season.team.endsWith("成棒隊"),
      )
    )
      amateurClubCareers += 1;
    const firstProfessional = result.state.seasons.find((season) => season.level !== "amateur");
    const entryLeague = firstProfessional?.league;
    if (entryLeague === "cpbl" || entryLeague === "npb" || entryLeague === "mlb")
      entryLeagues[entryLeague] += 1;
    else entryLeagues.none += 1;
    if (!firstProfessional) entryRoutes.noProfessional += 1;
    else if (firstProfessional.age <= 19) entryRoutes.highSchool += 1;
    else if (firstProfessional.age <= 23) entryRoutes.university += 1;
    else entryRoutes.amateurClub += 1;
    if (result.state.scouting)
      for (const market of ["cpbl", "npb", "mlb"] as const)
        maximumScoutingRating[market] = Math.max(
          maximumScoutingRating[market],
          result.state.scouting.markets[market].internalRating,
        );
    earnings.push(result.state.summary.totalEarnings);
    actionCounts.push(result.actions);
  }
  actionCounts.sort((left, right) => left - right);
  earnings.sort((left, right) => left - right);
  const median = actionCounts[Math.floor(actionCounts.length / 2)] ?? 0;
  const maximum = actionCounts.at(-1) ?? 0;
  if (maximum > 300)
    throw new Error(`${positionGroup} simulation exceeded action limit: ${maximum}`);
  if (median < 70 || median > 210)
    throw new Error(`${positionGroup} median interaction count is outside target band: ${median}`);
  if (
    count >= 10_000 &&
    (entryLeagues.cpbl === 0 ||
      entryLeagues.npb === 0 ||
      entryLeagues.mlb === 0 ||
      entryRoutes.highSchool === 0 ||
      entryRoutes.university === 0 ||
      entryRoutes.amateurClub === 0)
  )
    throw new Error(`${positionGroup} simulation did not exercise every legal amateur route`);
  reports.push({
    positionGroup,
    careers: count,
    medianActions: median,
    maxActions: maximum,
    professionalCareers,
    amateurClubCareers,
    entryLeagues,
    entryRoutes,
    maximumScoutingRating,
    medianTotalEarnings: earnings[Math.floor(earnings.length / 2)] ?? 0,
    p90TotalEarnings: earnings[Math.floor(earnings.length * 0.9)] ?? 0,
  });
}
logger.success(
  JSON.stringify(
    { careersPerPosition: count, totalCareers: count * positionGroups.length, reports },
    null,
    2,
  ),
);
