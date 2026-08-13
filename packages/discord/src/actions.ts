import type { GameAction } from "@yakyulife/core";

const CUSTOM_ID_PATTERN = /^career:([0-9a-f-]{36}):(\d+):([a-z0-9_-]+)$/i;

export interface ParsedCareerCustomId {
  careerId: string;
  revision: number;
  actionKey: string;
}

export function parseCareerCustomId(value: string): ParsedCareerCustomId | null {
  const match = CUSTOM_ID_PATTERN.exec(value);
  const careerId = match?.[1];
  const revisionValue = match?.[2];
  const actionKey = match?.[3];
  if (!careerId || !revisionValue || !actionKey) return null;
  const revision = Number(revisionValue);
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  return { careerId, revision, actionKey };
}

export function toCustomId(careerId: string, revision: number, actionKey: string): string {
  return `career:${careerId}:${revision}:${actionKey}`;
}

export function actionFromKey(actionKey: string): GameAction | null {
  if (actionKey.startsWith("die_")) {
    const ability = actionKey.slice(4);
    if (["stamina", "velocity", "control", "breaking"].includes(ability)) {
      return {
        type: "assign_training_die",
        ability: ability as "stamina" | "velocity" | "control" | "breaking",
      };
    }
  }
  if (actionKey === "training_undo") return { type: "undo_training_die" };
  if (actionKey === "training_confirm") return { type: "confirm_training" };
  if (actionKey.startsWith("train_")) {
    const [, primary, secondary] = actionKey.split("_");
    const valid = ["stamina", "velocity", "control", "breaking"];
    if (primary && secondary && valid.includes(primary) && valid.includes(secondary)) {
      return {
        type: "allocate_training",
        primary: primary as Extract<GameAction, { type: "allocate_training" }>["primary"],
        secondary: secondary as Extract<GameAction, { type: "allocate_training" }>["secondary"],
      };
    }
  }
  if (actionKey === "event_safe" || actionKey === "event_normal" || actionKey === "event_bold") {
    return { type: "choose_event", strategy: actionKey.slice(6) as "safe" | "normal" | "bold" };
  }
  if (actionKey === "effort_full" || actionKey === "effort_normal" || actionKey === "effort_easy") {
    return {
      type: "choose_pitch_effort",
      effort: actionKey.slice(7) as "full" | "normal" | "easy",
    };
  }
  if (actionKey === "draft_enter") return { type: "choose_draft", choice: "draft" };
  if (actionKey === "draft_school") return { type: "choose_draft", choice: "continue_school" };
  if (actionKey === "tj_surgery") return { type: "choose_tj", choice: "surgery" };
  if (actionKey === "tj_injection") return { type: "choose_tj", choice: "injection" };
  if (actionKey.startsWith("contract_offer_"))
    return { type: "choose_contract", choice: actionKey.slice("contract_offer_".length) };
  if (actionKey === "contract_long") return { type: "choose_contract", choice: "long" };
  if (actionKey === "contract_short") return { type: "choose_contract", choice: "short" };
  if (actionKey === "contract_retire") return { type: "choose_contract", choice: "retire" };
  if (actionKey === "life_accept" || actionKey === "life_decline" || actionKey === "life_bold")
    return { type: "choose_life", choice: actionKey.slice(5) as "accept" | "decline" | "bold" };
  if (actionKey === "abl_accept" || actionKey === "abl_decline")
    return { type: "choose_abl", choice: actionKey.slice(4) as "accept" | "decline" };
  if (actionKey === "international_accept" || actionKey === "international_decline")
    return {
      type: "choose_international",
      choice: actionKey.slice("international_".length) as "accept" | "decline",
    };
  if (actionKey === "career_continue") return { type: "choose_career", choice: "continue" };
  if (actionKey === "career_retire") return { type: "choose_career", choice: "retire" };
  return null;
}
