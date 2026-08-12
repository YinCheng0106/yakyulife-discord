import signale from "signale";

export function createScriptLogger(scope: string): signale.Signale {
  return new signale.Signale({ scope });
}
