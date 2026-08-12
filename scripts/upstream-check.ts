import { UPSTREAM_COMMIT } from "@yakyulife/core";
import { createScriptLogger } from "./logger.ts";

const logger = createScriptLogger("UPSTREAM");

const response = await fetch("https://api.github.com/repos/LeoGGcat/yakyulife/commits/main", {
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "yakyulife-discord-upstream-check",
  },
});
if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
const payload = (await response.json()) as {
  sha?: string;
  html_url?: string;
  commit?: { message?: string };
};
if (!payload.sha) throw new Error("GitHub response did not contain a commit SHA");
logger.info(`Pinned upstream: ${UPSTREAM_COMMIT}`);
logger.info(`Current upstream: ${payload.sha}`);
logger.info(
  payload.sha === UPSTREAM_COMMIT
    ? "No upstream change detected."
    : "Upstream changed; review manually before porting rules.",
);
if (payload.commit?.message)
  logger.info(`Latest message: ${payload.commit.message.split("\n")[0]}`);
if (payload.html_url) logger.info(payload.html_url);
