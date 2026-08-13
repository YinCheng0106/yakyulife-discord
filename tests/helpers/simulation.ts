import {
  type AbilityKey,
  CAREER_EVENTS,
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
      const abilities: AbilityKey[] =
        (state.positionGroup ?? "pitcher") === "pitcher"
          ? ["velocity", "control", "breaking", "stamina"]
          : state.positionGroup === "catcher"
            ? ["contact", "power", "eye", "fielding", "range", "arm", "calling", "speed", "stamina"]
            : ["contact", "power", "eye", "fielding", "range", "arm", "speed", "stamina"];
      const ability = abilities.find((candidate) => (preview.abilities[candidate] ?? 0) < 80);
      if (!ability) return { type: "confirm_training" };
      return {
        type: "assign_training_die",
        ability,
      };
    }
    return { type: "confirm_training" };
  }
  if (pending.type === "event") {
    const event = CAREER_EVENTS.find((candidate) => candidate.id === pending.eventId);
    return {
      type: "choose_event",
      strategy: event?.choiceLabels?.[2] === undefined && event?.choiceLabels ? "safe" : "normal",
    };
  }
  if (pending.type === "pitch_effort") return { type: "choose_pitch_effort", effort: "normal" };
  if (pending.type === "draft") {
    if (pending.canEnterDraft !== false) return { type: "choose_draft", choice: "draft" };
    if (pending.canContinueSchool) return { type: "choose_draft", choice: "continue_school" };
    if (pending.canJoinAmateur) return { type: "choose_draft", choice: "join_amateur" };
    return { type: "choose_draft", choice: "retire" };
  }
  if (pending.type === "scout_opportunity")
    return {
      type: "choose_scout_opportunity",
      choice:
        pending.offers.find((offer) => offer.kind === "mlb_contract")?.id ??
        pending.offers.find((offer) => offer.kind === "npb_contract")?.id ??
        pending.offers[0]?.id ??
        "decline",
    };
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
  if (pending.type === "contract_terms" || pending.type === "free_agent_market") {
    return {
      type: "choose_contract",
      choice: pending.offers[0]?.id ?? (pending.type === "free_agent_market" ? "retire" : "short"),
    };
  }
  if (pending.type === "free_agency_decision")
    return { type: "choose_free_agency", choice: "market" };
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
