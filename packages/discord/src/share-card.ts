import { contentPack } from "@yakyulife/content";
import {
  type CareerRecord,
  type CareerSummary,
  POSITION_GROUP_LABELS,
  type SalaryDuel,
  TRAIT_LABELS,
} from "@yakyulife/core";
import sharp from "sharp";
import { ATTRIBUTION } from "./attribution.ts";

export interface ShareCardRenderer {
  render(career: CareerRecord): Promise<Buffer>;
  renderDuel(duel: SalaryDuel): Promise<Buffer>;
}

export interface ShareCardViewModel {
  name: string;
  kicker: string;
  careerLine: string;
  destinationLine: string;
  totalEarnings: string;
  peakSalary: string;
  lastSalary: string;
  statLines: readonly string[];
  honors: readonly string[];
  traits: readonly string[];
  family: string;
  scouting: string;
  seed: string;
  engine: string;
  ending: string;
  highlights: readonly string[];
}

export function shareCardFilename(careerId: string): string {
  return `yakyulife-${careerId}.png`;
}

export function duelShareCardFilename(duelId: string): string {
  return `yakyulife-duel-${duelId}.png`;
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString("zh-TW")} 萬`;
}

function clipped(values: readonly string[], limit: number): string[] {
  if (values.length <= limit) return [...values];
  return [...values.slice(0, limit), `另有 ${values.length - limit} 項`];
}

export function createShareCardViewModel(summary: CareerSummary): ShareCardViewModel {
  const positionGroup = summary.positionGroup ?? "pitcher";
  const pitcher = positionGroup === "pitcher";
  const statLines = pitcher
    ? [
        `${summary.careerWins} 勝  ·  ${summary.careerSaves} 救援`,
        `${summary.careerStrikeouts.toLocaleString("zh-TW")} K  ·  ${summary.careerInnings.toLocaleString("zh-TW")} 局`,
        `最佳 ERA  ${summary.bestEra?.toFixed(2) ?? "—"}`,
      ]
    : [
        `${(summary.careerHits ?? 0).toLocaleString("zh-TW")} 安  ·  ${(summary.careerHomeRuns ?? 0).toLocaleString("zh-TW")} 轟`,
        `${(summary.careerRbis ?? 0).toLocaleString("zh-TW")} 打點  ·  ${(summary.careerStolenBases ?? 0).toLocaleString("zh-TW")} 盜壘`,
        `AVG ${summary.careerAverage?.toFixed(3) ?? "—"}  ·  OPS ${summary.careerOps?.toFixed(3) ?? "—"}`,
      ];
  const family = summary.family
    ? `${summary.family.status === "married" ? "已婚" : summary.family.status === "dating" ? "交往中" : summary.family.status === "divorced" ? "曾有婚姻" : "未婚"}  ·  子女 ${summary.family.children} 人`
    : "未記錄家庭狀態";
  const scoutingTier = {
    unseen: "尚未進入名單",
    watchlist: "地區球探追蹤",
    cross_check: "球團交叉覆核",
    invited: "正式邀請",
  }[summary.highestScoutingTier ?? "unseen"];
  return {
    name: summary.name,
    kicker: `${POSITION_GROUP_LABELS[positionGroup]}  ·  ${summary.primaryPosition ?? (pitcher ? "P" : "DH")}`,
    careerLine: `${summary.finalAge} 歲引退  ·  ${summary.seasons} 個職業球季`,
    destinationLine: `${summary.finalTeam ?? "未取得職業球隊"}  ·  ${(summary.finalLeague ?? "amateur").toUpperCase()}`,
    totalEarnings: money(summary.totalEarnings),
    peakSalary: money(summary.peakAnnualSalary ?? 0),
    lastSalary: money(summary.lastAnnualSalary ?? 0),
    statLines,
    honors: clipped(summary.honors, 5),
    traits: clipped(
      summary.traits.map((trait) => contentPack.traits[trait] ?? TRAIT_LABELS[trait]),
      6,
    ),
    family,
    scouting: `最高球探分級：${scoutingTier}`,
    seed: summary.seed,
    engine: summary.contentPackVersion
      ? `${summary.engineVersion} · Content ${summary.contentPackVersion}`
      : summary.engineVersion,
    ending: summary.ending,
    highlights: clipped(
      [...(summary.scoutingHighlights ?? []).slice(-1), ...(summary.careerHighlights ?? [])],
      3,
    ),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function truncate(value: string, length: number): string {
  return Array.from(value).length <= length
    ? value
    : `${Array.from(value)
        .slice(0, length - 1)
        .join("")}…`;
}

function textLines(values: readonly string[], startY: number, size: number, gap: number): string {
  return values
    .map(
      (value, index) =>
        `<text x="96" y="${startY + index * gap}" font-size="${size}">${escapeXml(truncate(value, 34))}</text>`,
    )
    .join("");
}

export const sharpShareCardRenderer: ShareCardRenderer = {
  async render(career) {
    if (!career.summary) throw new Error("Career is not completed");
    const view = createShareCardViewModel(career.summary);
    const attribution = ATTRIBUTION.split("\n")[0] ?? "YaKyuLife attribution";
    const svg = `
      <svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="ambient" cx="80%" cy="4%" r="90%"><stop stop-color="#315d45"/><stop offset="1" stop-color="#0b1511"/></radialGradient>
          <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M42 0H0V42" fill="none" stroke="#d5e4d9" stroke-opacity=".035"/></pattern>
        </defs>
        <rect width="1200" height="1600" fill="url(#ambient)"/><rect width="1200" height="1600" fill="url(#grid)"/>
        <path d="M810 90c190 82 286 238 288 468M855 126c138 70 207 187 209 350" fill="none" stroke="#d9a441" stroke-opacity=".22" stroke-width="3"/>
        <g font-family="Noto Sans CJK TC, Noto Sans TC, sans-serif" fill="#f2f4ec" style="font-variant-numeric:tabular-nums">
          <text x="72" y="92" font-size="22" letter-spacing="5" fill="#b6c9bc">YAKYULIFE · CAREER POSTER</text>
          <text x="72" y="205" font-size="76" font-weight="700" letter-spacing="-3">${escapeXml(truncate(view.name, 12))}</text>
          <text x="76" y="252" font-size="28" fill="#d9a441">${escapeXml(view.kicker)}</text>
          <text x="76" y="294" font-size="24" fill="#a9b7ae">${escapeXml(view.careerLine)}</text>
          <text x="76" y="326" font-size="19" fill="#82968a">${escapeXml(truncate(view.destinationLine, 38))}</text>

          <rect x="64" y="352" width="1072" height="300" rx="24" fill="#07100c" fill-opacity=".66"/>
          <text x="96" y="408" font-size="20" letter-spacing="4" fill="#8eaa98">CAREER EARNINGS · 新臺幣萬元（遊戲值）</text>
          <text x="92" y="505" font-size="78" font-weight="700" fill="#d9a441">${escapeXml(view.totalEarnings)}</text>
          <path d="M96 548H1104" stroke="#a8b9ae" stroke-opacity=".22"/>
          <text x="96" y="598" font-size="20" fill="#8eaa98">最高年薪</text><text x="238" y="598" font-size="30" font-weight="600">${escapeXml(view.peakSalary)}</text>
          <text x="676" y="598" font-size="20" fill="#8eaa98">最後年薪</text><text x="818" y="598" font-size="30" font-weight="600">${escapeXml(view.lastSalary)}</text>

          <text x="72" y="730" font-size="22" letter-spacing="4" fill="#8eaa98">CAREER NUMBERS</text>
          ${textLines(view.statLines, 798, 38, 64)}

          <text x="72" y="1018" font-size="22" letter-spacing="4" fill="#8eaa98">HONORS</text>
          ${textLines(view.honors.length ? view.honors : ["尚無主要獎項"], 1072, 25, 42)}

          <text x="640" y="1018" font-size="22" letter-spacing="4" fill="#8eaa98">PROFILE</text>
          <text x="640" y="1072" font-size="25">${escapeXml(truncate(view.traits.length ? view.traits.join(" · ") : "尚未解鎖特性", 30))}</text>
          <text x="640" y="1118" font-size="24" fill="#b6c9bc">${escapeXml(view.family)}</text>
          <text x="640" y="1162" font-size="22" fill="#d9a441">${escapeXml(view.scouting)}</text>

          <rect x="64" y="1280" width="1072" height="176" rx="18" fill="#d7e2da" fill-opacity=".07"/>
          <text x="92" y="1330" font-size="18" letter-spacing="3" fill="#8eaa98">FINAL NOTE</text>
          <text x="92" y="1374" font-size="22">${escapeXml(truncate(view.highlights.join("  ·  ") || view.ending, 55))}</text>
          <text x="92" y="1420" font-size="17" fill="#8eaa98">SEED ${escapeXml(truncate(view.seed, 24))}  ·  ENGINE ${escapeXml(view.engine)}</text>

          <text x="72" y="1520" font-size="16" fill="#819087">${escapeXml(attribution)}</text>
          <text x="72" y="1554" font-size="15" fill="#819087">Inspired by real baseball systems; all players, teams and outcomes are fictional.</text>
        </g>
      </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  },
  async renderDuel(duel) {
    const players = [1, 2].map((slot) => duel.players.find((player) => player.slot === slot));
    const row = (slot: number, y: number): string => {
      const player = players[slot - 1];
      const winner = duel.winnerSlot === slot;
      return `
        <rect x="72" y="${y}" width="1056" height="330" rx="26" fill="${winner ? "#193d2d" : "#101d17"}" stroke="${winner ? "#d9a441" : "#33463a"}" stroke-width="3"/>
        <text x="112" y="${y + 62}" font-size="22" letter-spacing="4" fill="#93aa9b">PLAYER ${slot}${winner ? " · WINNER" : ""}</text>
        <text x="112" y="${y + 130}" font-size="52" font-weight="700">${escapeXml(truncate(player?.playerName ?? `玩家 ${slot}`, 12))}</text>
        <text x="112" y="${y + 222}" font-size="58" font-weight="700" fill="#d9a441">${escapeXml(money(player?.totalEarnings ?? 0))}</text>
        <text x="112" y="${y + 278}" font-size="22" fill="#aebdb3">最高年薪 ${escapeXml(money(player?.peakAnnualSalary ?? 0))}  ·  最後年薪 ${escapeXml(money(player?.lastAnnualSalary ?? 0))}</text>`;
    };
    const outcome =
      duel.status === "invalid"
        ? "驗證失敗 · 本場不計勝負"
        : duel.winnerSlot
          ? `玩家 ${duel.winnerSlot} 勝出`
          : duel.outcomeReason === "draw"
            ? "本場和局"
            : "本場無結果";
    const svg = `
      <svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="duel" cx="50%" cy="0%" r="100%"><stop stop-color="#315d45"/><stop offset="1" stop-color="#08100c"/></radialGradient></defs>
        <rect width="1200" height="1600" fill="url(#duel)"/>
        <g font-family="Noto Sans CJK TC, Noto Sans TC, sans-serif" fill="#f2f4ec" style="font-variant-numeric:tabular-nums">
          <text x="72" y="92" font-size="22" letter-spacing="5" fill="#b6c9bc">YAKYULIFE · SALARY DUEL</text>
          <text x="72" y="196" font-size="66" font-weight="700">薪資好友賽結果</text>
          <text x="76" y="250" font-size="26" fill="#d9a441">${escapeXml(POSITION_GROUP_LABELS[duel.positionGroup])}  ·  ${escapeXml(outcome)}</text>
          ${row(1, 326)}
          ${row(2, 700)}
          <rect x="72" y="1092" width="1056" height="274" rx="24" fill="#d7e2da" fill-opacity=".07"/>
          <text x="108" y="1150" font-size="19" letter-spacing="4" fill="#93aa9b">VERIFICATION</text>
          <text x="108" y="1212" font-size="24">ENGINE ${escapeXml(duel.engineVersion)}  ·  RULESET ${escapeXml(duel.rulesetVersion)}</text>
          <text x="108" y="1264" font-size="20" fill="#aebdb3">SEED ${escapeXml(truncate(duel.revealedSeed ?? "未公開", 30))}</text>
          <text x="108" y="1312" font-size="17" fill="#84978a">分數由伺服器重播生涯操作後核對；新臺幣萬元（遊戲值）</text>
          <text x="72" y="1498" font-size="16" fill="#819087">${escapeXml(ATTRIBUTION.split("\n")[0] ?? "YaKyuLife attribution")}</text>
          <text x="72" y="1535" font-size="15" fill="#819087">同守位、同 engine 與 ruleset；不含獎品、Elo 或全球排名。</text>
        </g>
      </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  },
};
