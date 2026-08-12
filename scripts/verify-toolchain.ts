interface PackageManifest {
  packageManager?: string;
  engines?: { bun?: string };
  devDependencies?: Record<string, string>;
}

import { createScriptLogger } from "./logger.ts";

const logger = createScriptLogger("TOOLCHAIN");

const manifest = (await Bun.file("package.json").json()) as PackageManifest;
const expected = manifest.packageManager?.replace(/^bun@/, "");
if (!expected) throw new Error("packageManager must pin Bun");
if (manifest.engines?.bun !== expected) throw new Error("engines.bun is not synchronized");
if (manifest.devDependencies?.["@types/bun"] !== expected) {
  throw new Error("@types/bun is not synchronized");
}
if (Bun.version !== expected) throw new Error(`Running Bun ${Bun.version}, expected ${expected}`);

const dockerfile = await Bun.file("Dockerfile").text();
const dockerTags = [...dockerfile.matchAll(/^FROM oven\/bun:([^\s]+)/gm)].map((match) => match[1]);
if (
  dockerTags.length < 2 ||
  dockerTags.some((tag) => tag !== expected && tag !== `${expected}-slim`)
) {
  throw new Error("Docker Bun tags are not synchronized");
}

const workflow = await Bun.file(".github/workflows/ci.yml").text();
if (!workflow.includes(`bun-version: ${expected}`))
  throw new Error("CI Bun version is not synchronized");
logger.success(`Bun toolchain pins are synchronized at ${expected}.`);
