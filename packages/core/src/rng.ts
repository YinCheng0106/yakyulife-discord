function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

export function initialRngState(seed: string): number {
  return hashSeed(seed);
}

export function random(state: { rngState: number }): number {
  let value = (state.rngState + 0x6d2b79f5) | 0;
  state.rngState = value >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

export function randomInt(state: { rngState: number }, minimum: number, maximum: number): number {
  return minimum + Math.floor(random(state) * (maximum - minimum + 1));
}

export function chance(state: { rngState: number }, percent: number): boolean {
  return random(state) * 100 < percent;
}

export function pick<T>(state: { rngState: number }, values: readonly T[]): T {
  const value = values[Math.floor(random(state) * values.length)];
  if (value === undefined) throw new Error("Cannot pick from an empty collection");
  return value;
}
