import type { CareerRecord } from "@yakyulife/core";
import sharp from "sharp";
import { ATTRIBUTION } from "./attribution.ts";

export interface ShareCardRenderer {
  render(career: CareerRecord): Promise<Buffer>;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const sharpShareCardRenderer: ShareCardRenderer = {
  async render(career) {
    const summary = career.summary;
    if (!summary) throw new Error("Career is not completed");
    const attribution = ATTRIBUTION.split("\n")[0] ?? "YaKyoLife attribution";
    const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#102f24"/><stop offset="1" stop-color="#1f8b4c"/></linearGradient></defs>
        <rect width="1200" height="630" fill="url(#bg)"/><rect x="56" y="48" width="1088" height="534" rx="28" fill="#081b15" fill-opacity=".72"/>
        <g fill="#f5fff9" font-family="Noto Sans CJK TC, Noto Sans TC, sans-serif">
          <text x="100" y="125" font-size="31" fill="#83e6ad">YAKYULIFE CAREER CARD</text>
          <text x="100" y="205" font-size="62" font-weight="700">${escapeXml(summary.name)}</text>
          <text x="100" y="258" font-size="28">${summary.finalAge} 歲引退・${summary.seasons} 個職業球季・版本 ${escapeXml(summary.engineVersion)}</text>
          <text x="100" y="355" font-size="52" font-weight="700">${summary.careerWins} 勝</text>
          <text x="390" y="355" font-size="52" font-weight="700">${summary.careerSaves} 救援</text>
          <text x="750" y="355" font-size="52" font-weight="700">${summary.careerStrikeouts} K</text>
          <text x="100" y="425" font-size="30">生涯 ${summary.careerInnings} 局・最佳 ERA ${summary.bestEra?.toFixed(1) ?? "—"}</text>
          <text x="100" y="480" font-size="25">${escapeXml(summary.ending)}</text>
          <text x="100" y="542" font-size="17" fill="#b8d8c5">${escapeXml(attribution)}</text>
        </g>
      </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  },
};
