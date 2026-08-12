import { type CareerState, type GameAction, reduceCareer } from "@yakyulife/core";

export function automaticAction(state: CareerState): GameAction {
  const pending = state.pending;
  if (!pending) throw new Error("Active career has no pending decision");
  if (pending.type === "training")
    return { type: "allocate_training", primary: "velocity", secondary: "control" };
  if (pending.type === "event") return { type: "choose_event", strategy: "normal" };
  if (pending.type === "pitch_effort") return { type: "choose_pitch_effort", effort: "normal" };
  if (pending.type === "draft") return { type: "choose_draft", choice: "draft" };
  if (pending.type === "tj") return { type: "choose_tj", choice: "surgery" };
  if (pending.type === "contract") {
    return { type: "choose_contract", choice: state.age >= 31 ? "retire" : "short" };
  }
  return { type: "choose_career", choice: state.age >= 31 ? "retire" : "continue" };
}

export function runCareer(
  initial: CareerState,
  maximumActions = 100,
): { state: CareerState; actions: number } {
  let state = initial;
  let actions = 0;
  while (!state.summary && actions < maximumActions) {
    state = reduceCareer(state, automaticAction(state)).state;
    actions += 1;
  }
  if (!state.summary) throw new Error(`Career exceeded ${maximumActions} actions`);
  return { state, actions };
}

export function assertFiniteTree(value: unknown, path = "state"): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error(`${path} is not finite`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertFiniteTree(item, `${path}[${index}]`);
    });
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) assertFiniteTree(item, `${path}.${key}`);
  }
}
