import {
  type AbilityKey,
  type CareerState,
  type GameAction,
  reduceCareer,
  trainingPreview,
} from "@yakyulife/core";

export function automaticAction(state: CareerState): GameAction {
  const pending = state.pending;
  if (!pending) throw new Error("Active career has no pending decision");
  if (pending.type === "training") {
    if (!pending.assignments)
      return { type: "allocate_training", primary: "velocity", secondary: "control" };
    if (pending.assignments.length < pending.dice.length) {
      const preview = trainingPreview(state);
      const abilities: AbilityKey[] = ["velocity", "control", "breaking", "stamina"];
      const ability = abilities.find((candidate) => preview.abilities[candidate] < 80);
      if (!ability) return { type: "confirm_training" };
      return {
        type: "assign_training_die",
        ability,
      };
    }
    return { type: "confirm_training" };
  }
  if (pending.type === "event") return { type: "choose_event", strategy: "normal" };
  if (pending.type === "pitch_effort") return { type: "choose_pitch_effort", effort: "normal" };
  if (pending.type === "draft") return { type: "choose_draft", choice: "draft" };
  if (pending.type === "tj") return { type: "choose_tj", choice: "surgery" };
  if (pending.type === "contract") {
    return {
      type: "choose_contract",
      choice:
        state.age >= 36
          ? "retire"
          : (pending.offers.find((offer) => offer.kind === "short")?.id ?? "short"),
    };
  }
  if (pending.type === "life") return { type: "choose_life", choice: "accept" };
  if (pending.type === "abl") return { type: "choose_abl", choice: "accept" };
  if (pending.type === "international") return { type: "choose_international", choice: "accept" };
  return { type: "choose_career", choice: state.age >= 31 ? "retire" : "continue" };
}

export function runCareer(
  initial: CareerState,
  maximumActions = 250,
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
