import { createCareerState } from "@yakyulife/core";
import { assertFiniteTree, runCareer } from "../tests/helpers/simulation.ts";

const count = Number(process.env.SIMULATION_COUNT ?? "10000");
if (!Number.isInteger(count) || count < 1)
  throw new Error("SIMULATION_COUNT must be a positive integer");
const actionCounts: number[] = [];
let professionalCareers = 0;
for (let index = 0; index < count; index += 1) {
  const result = runCareer(createCareerState(`投手${index}`, `simulation-${index}`));
  assertFiniteTree(result.state);
  if (result.state.summary && result.state.summary.seasons > 0) professionalCareers += 1;
  actionCounts.push(result.actions);
}
actionCounts.sort((left, right) => left - right);
const median = actionCounts[Math.floor(actionCounts.length / 2)] ?? 0;
const maximum = actionCounts.at(-1) ?? 0;
if (maximum > 100) throw new Error(`Simulation exceeded action limit: ${maximum}`);
if (median > 60) throw new Error(`Median interaction count exceeds target: ${median}`);
console.log(
  JSON.stringify(
    { careers: count, medianActions: median, maxActions: maximum, professionalCareers },
    null,
    2,
  ),
);
