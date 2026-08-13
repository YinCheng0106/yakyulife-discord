import {
  ABILITY_LABELS,
  type AbilityKey,
  CAREER_EVENTS,
  type CareerHistory,
  type CareerRecord,
  LEGACY_ENGINE_VERSION,
  LEVEL_LABELS,
  overall,
  type PendingDecision,
  ROLE_LABELS,
  STRATEGY_CONFIG,
  TRAIT_LABELS,
  trainingPreview,
} from "@yakyulife/core";
import {
  ActionRowBuilder,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIContainerComponent,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { toCustomId } from "./actions.ts";
import { ATTRIBUTION } from "./attribution.ts";

export interface CareerMessage {
  components: APIContainerComponent[];
  flags: MessageFlags.IsComponentsV2;
  allowedMentions: { parse: [] };
}

function actionRow(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

function button(
  career: CareerRecord,
  actionKey: string,
  label: string,
  style: ButtonStyle = ButtonStyle.Secondary,
  disabled = false,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(toCustomId(career.id, career.stateRevision, actionKey))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function decisionRows(
  career: CareerRecord,
  pending: PendingDecision | null,
): ActionRowBuilder<ButtonBuilder>[] {
  if (!pending) return [];
  if (pending.type === "training") {
    const abilities: AbilityKey[] = ["stamina", "velocity", "control", "breaking"];
    if (career.engineVersion !== LEGACY_ENGINE_VERSION) {
      const assignments = pending.assignments ?? [];
      const preview = trainingPreview(career.state);
      const complete = assignments.length >= pending.dice.length;
      const allCapped = abilities.every((ability) => preview.abilities[ability] >= 80);
      return [
        actionRow(
          abilities.map((ability) =>
            button(
              career,
              `die_${ability}`,
              `${ABILITY_LABELS[ability]} ${preview.abilities[ability]}${preview.gains[ability] > 0 ? ` (+${preview.gains[ability]})` : ""}`,
              ButtonStyle.Primary,
              complete || (preview.abilities[ability] >= 80 && !allCapped),
            ),
          ),
        ),
        actionRow([
          button(
            career,
            "training_undo",
            "↩ 復原上一顆",
            ButtonStyle.Secondary,
            assignments.length === 0,
          ),
          button(
            career,
            "training_confirm",
            allCapped && !complete ? "捨棄剩餘骰並確認" : "確認訓練成果",
            ButtonStyle.Success,
            !complete && !allCapped,
          ),
        ]),
      ];
    }
    const choices = abilities.flatMap((primary) =>
      abilities
        .filter((secondary) => secondary !== primary)
        .map((secondary) =>
          button(
            career,
            `train_${primary}_${secondary}`,
            `${ABILITY_LABELS[primary]} 70%／${ABILITY_LABELS[secondary]} 30%`,
          ),
        ),
    );
    return [
      actionRow(choices.slice(0, 4)),
      actionRow(choices.slice(4, 8)),
      actionRow(choices.slice(8, 12)),
    ];
  }
  if (pending.type === "event") {
    const boldChance = career.state.traits.clutch ? 50 : STRATEGY_CONFIG.bold.successChance;
    return [
      actionRow([
        button(
          career,
          "event_safe",
          `保守 ${STRATEGY_CONFIG.safe.successChance}%`,
          ButtonStyle.Success,
        ),
        button(
          career,
          "event_normal",
          `正常 ${STRATEGY_CONFIG.normal.successChance}%`,
          ButtonStyle.Primary,
        ),
        button(career, "event_bold", `豪賭 ${boldChance}%`, ButtonStyle.Danger),
      ]),
    ];
  }
  if (pending.type === "pitch_effort") {
    return [
      actionRow([
        button(career, "effort_easy", "省力", ButtonStyle.Success),
        button(career, "effort_normal", "正常", ButtonStyle.Primary),
        button(career, "effort_full", "全力", ButtonStyle.Danger),
      ]),
    ];
  }
  if (pending.type === "draft") {
    const buttons = [button(career, "draft_enter", "投入選秀", ButtonStyle.Primary)];
    if (pending.canContinueSchool) buttons.push(button(career, "draft_school", "繼續升學"));
    return [actionRow(buttons)];
  }
  if (pending.type === "tj") {
    return [
      actionRow([
        button(career, "tj_surgery", "接受 TJ 手術", ButtonStyle.Primary),
        button(career, "tj_injection", "打針硬撐", ButtonStyle.Danger),
      ]),
    ];
  }
  if (pending.type === "contract") {
    const offers = pending.offers.map((offer) =>
      button(
        career,
        `contract_offer_${offer.id ?? offer.kind}`,
        offer.kind === "overseas"
          ? `${offer.level === "cpbl1" || offer.level === "cpbl2" ? "返台" : offer.level ? LEVEL_LABELS[offer.level] : "海外"}｜${offer.team ?? "海外球隊"}｜${
              {
                posting: "入札",
                fa: "FA",
                free_agent: "自由球員",
                injury_replacement: "傷兵替補",
                tryout: "測試約",
              }[offer.source ?? "free_agent"]
            } ${offer.years} 年`
          : `${offer.kind === "long" ? "長約" : "短約"} ${offer.years} 年／${offer.salary} 萬`,
        offer.kind === "long" ? ButtonStyle.Primary : ButtonStyle.Success,
      ),
    );
    return [
      actionRow(offers.slice(0, 4)),
      actionRow([button(career, "contract_retire", "引退", ButtonStyle.Danger)]),
    ];
  }
  if (pending.type === "life") {
    if (pending.eventId === "temptation") {
      return [
        actionRow([
          button(career, "life_decline", "拒絕誘惑", ButtonStyle.Success),
          button(career, "life_bold", "赴約賭一把", ButtonStyle.Danger),
        ]),
      ];
    }
    return [
      actionRow([
        button(
          career,
          "life_accept",
          pending.eventId === "proposal" ? "求婚" : "接受",
          ButtonStyle.Success,
        ),
        button(
          career,
          "life_decline",
          pending.eventId === "proposal" ? "延後婚期" : "婉拒",
          ButtonStyle.Secondary,
        ),
      ]),
    ];
  }
  if (pending.type === "abl") {
    return [
      actionRow([
        button(career, "abl_accept", `接受 ${pending.team} 邀請`, ButtonStyle.Primary),
        button(career, "abl_decline", "留隊休養", ButtonStyle.Secondary),
      ]),
    ];
  }
  if (pending.type === "international") {
    const buttons = [button(career, "international_accept", "披上中華隊戰袍", ButtonStyle.Primary)];
    if (!pending.forced)
      buttons.push(button(career, "international_decline", "婉拒徵召", ButtonStyle.Secondary));
    return [actionRow(buttons)];
  }
  return [
    actionRow([
      button(career, "career_continue", "再戰一年", ButtonStyle.Primary),
      button(career, "career_retire", "宣布引退", ButtonStyle.Danger),
    ]),
  ];
}

function decisionText(pending: PendingDecision | null): string {
  if (!pending) return "生涯已結束。";
  if (pending.type === "training")
    return pending.assignments
      ? `🎲 逐骰配點：${pending.dice.map((die, index) => `${index < (pending.assignments?.length ?? 0) ? "~~" : ""}${die}${index < (pending.assignments?.length ?? 0) ? "~~" : ""}`).join("　")}\n目前骰：**${pending.dice[pending.assignments.length] ?? "已分配完畢"}**｜剩餘 ${pending.dice.length - pending.assignments.length} 顆`
      : `🎲 本季訓練點數：**${pending.points}**（${pending.dice.join(" + ")}）`;
  if (pending.type === "event") {
    const event = CAREER_EVENTS.find((candidate) => candidate.id === pending.eventId);
    return event
      ? `**${event.title}**\n${event.description}\n請選擇處理方式。`
      : "本年主要事件已發生，請選擇處理方式。";
  }
  if (pending.type === "pitch_effort") return "請先決定本季的投球強度。";
  if (pending.type === "draft") return "生涯來到選秀岔路，請決定下一步。";
  if (pending.type === "tj") return "韌帶負荷已達臨界值，必須做出醫療決定。";
  if (pending.type === "contract") return "合約到期，請選擇下一份合約或引退。";
  if (pending.type === "life") {
    if (pending.eventId === "dating") return "場外出現新的緣分，要讓這段關係開始嗎？";
    if (pending.eventId === "proposal") return "交往多年後，兩人來到婚姻的岔路。";
    if (pending.eventId === "temptation") return "婚姻之外出現危險誘惑，每個選擇都會留下後果。";
    return "重要的家庭日子與自主訓練撞期，你要如何選擇？";
  }
  if (pending.type === "abl")
    return `${pending.team}邀請你參加澳職短期賽季；成長與疲勞會同時累積。`;
  if (pending.type === "international")
    return `${pending.tournament}徵召到來。${pending.forced ? "目前仍在列管期間，必須報到。" : "可選擇參賽或留隊調整。"}`;
  return "你已來到生涯後段，要繼續挑戰嗎？";
}

export function renderCareer(career: CareerRecord): CareerMessage {
  const state = career.state;
  const traits = (Object.entries(state.traits) as Array<[keyof typeof TRAIT_LABELS, boolean]>)
    .filter(([, active]) => active)
    .map(([key]) => TRAIT_LABELS[key]);
  const recent = state.recentEvents?.length
    ? state.recentEvents.map((event) => `- **${event.title}**｜${event.body}`)
    : state.lastOutcome.map((line) => `- ${line}`);
  const outcome = recent.length > 0 ? recent.join("\n") : "- 尚無";
  const container = new ContainerBuilder()
    .setAccentColor(0x1f8b4c)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ⚾ ${state.name}的投手生涯\n**${state.year} 年｜${state.age} 歲｜${state.team}｜${LEVEL_LABELS[state.level]}｜${ROLE_LABELS[state.role]}**\n` +
          `體力 ${state.abilities.stamina}｜球速 ${state.abilities.velocity}｜控球 ${state.abilities.control}｜變化球 ${state.abilities.breaking}｜總評 ${overall(state)}\n` +
          `特性：${traits.length > 0 ? traits.join("、") : "尚未解鎖"}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 最近結果\n${outcome}`))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 下一步\n${decisionText(state.pending)}`),
    );

  for (const row of decisionRows(career, state.pending)) container.addActionRowComponents(row);
  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 使用 \`/career history\` 查看完整年表｜Engine ${career.engineVersion}｜Revision ${career.stateRevision}｜${ATTRIBUTION}`,
      ),
    );
  return {
    components: [container.toJSON()],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function shareCardGallery(filename: string, playerName: string): MediaGalleryBuilder {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`)
      .setDescription(`${playerName}的 YaKyuLife 生涯分享卡`),
  );
}

export function renderCareerShare(filename: string, playerName: string): CareerMessage {
  const container = new ContainerBuilder()
    .setAccentColor(0x1f8b4c)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# ⚾ 生涯分享卡"))
    .addMediaGalleryComponents(shareCardGallery(filename, playerName))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${ATTRIBUTION}`));
  return {
    components: [container.toJSON()],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export type CareerComponents = readonly APIActionRowComponent<APIButtonComponent>[];

type HistoryControl = "page" | "previous" | "next" | "latest";

export function toHistoryCustomId(
  careerId: string,
  page: number,
  control: HistoryControl = "page",
): string {
  return `career-history:${careerId}:${control}:${page}`;
}

export function parseHistoryCustomId(value: string): { careerId: string; page: number } | null {
  const match = /^career-history:([0-9a-f-]{36}):(?:(?:page|previous|next|latest):)?(\d+)$/i.exec(
    value,
  );
  const careerId = match?.[1];
  const page = Number(match?.[2]);
  return careerId && Number.isSafeInteger(page) && page >= 0 ? { careerId, page } : null;
}

export function renderCareerHistory(
  history: CareerHistory,
  requestedPage: number,
  shareFilename?: string,
): CareerMessage {
  const page = Math.max(0, Math.min(requestedPage, Math.max(0, history.years.length - 1)));
  const year = history.years[page] ?? history.career.state.year;
  const entries = history.entries.filter(
    (entry) => entry.year === year && entry.title !== "訓練骰暫存" && entry.title !== "復原訓練骰",
  );
  const seasons = history.career.state.seasons.filter(
    (season) => (season.calendarYear ?? season.year) === year,
  );
  const eventText = entries.length
    ? entries.map((entry) => `- **${entry.title}**｜${entry.body}`).join("\n")
    : "- 本年度沒有已保存的事件日誌。";
  const visibleSeasons = seasons.filter(
    (season) => season.injured !== "major" && season.injured !== "rehab",
  );
  const hasSeasonEndingInjury = seasons.some(
    (season) => season.injured === "major" || season.injured === "rehab",
  );
  const hiddenSeasonNote = hasSeasonEndingInjury
    ? "本年度因 TJ 復健或重大傷勢賽季報銷，不列出該球季戰績資訊。"
    : "";
  const seasonText = visibleSeasons.length
    ? visibleSeasons
        .map(
          (season) =>
            `**${season.seasonLabel ?? `${season.year} ${LEVEL_LABELS[season.level]}`}｜${season.team}｜${ROLE_LABELS[season.role]}**\n` +
            `${season.games} 場｜${season.innings} 局｜${season.wins} 勝 ${season.losses} 敗｜${season.saves} 救援｜${season.holds} 中繼｜${season.strikeouts} K｜ERA ${season.era.toFixed(1)}｜WHIP ${season.whip.toFixed(1)}${season.injured !== "none" ? `｜傷病：${season.injured}` : ""}${season.awards.length ? `\n獎項：${season.awards.join("、")}` : ""}`,
        )
        .join("\n\n") + (hiddenSeasonNote ? `\n\n${hiddenSeasonNote}` : "")
    : hasSeasonEndingInjury
      ? hiddenSeasonNote
      : "本年度尚無球季成績。";
  const summary = history.career.summary;
  const leagueLabels = {
    amateur: "業餘",
    cpbl: "中職",
    npb: "日職",
    mlb: "美職",
    kbo: "韓職",
    abl: "澳職",
    international: "國際賽",
  } as const;
  const profileText =
    page === history.years.length - 1 && summary
      ? `\n\n### 生涯檔案\n${(summary.leagueTotals ?? [])
          .map(
            (total) =>
              `${leagueLabels[total.league]}｜${total.games} 場、${total.innings} 局、${total.wins} 勝、${total.saves} 救援、${total.strikeouts} K`,
          )
          .join(
            "\n",
          )}${summary.family ? `\n家庭：${summary.family.status === "married" ? `已婚，伴侶 ${summary.family.partner ?? "—"}` : summary.family.status === "dating" ? `交往中，伴侶 ${summary.family.partner ?? "—"}` : summary.family.status === "divorced" ? "離婚" : "未婚"}｜子女 ${summary.family.children} 人` : ""}`
      : "";
  const container = new ContainerBuilder()
    .setAccentColor(0x315a9b)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 📖 ${history.career.state.name}的生涯年表\n## ${year} 年｜${page + 1}／${Math.max(1, history.years.length)}\n\n### 年度事件\n${eventText}\n\n### 投球成績\n${seasonText}${profileText}`,
      ),
    );
  if (shareFilename && summary && page === history.years.length - 1) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("### 生涯分享卡"))
      .addMediaGalleryComponents(shareCardGallery(shareFilename, history.career.state.name));
  }
  container
    .addActionRowComponents(
      actionRow([
        new ButtonBuilder()
          .setCustomId(toHistoryCustomId(history.career.id, Math.max(0, page - 1), "previous"))
          .setLabel("上一年")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(
            toHistoryCustomId(
              history.career.id,
              Math.min(history.years.length - 1, page + 1),
              "next",
            ),
          )
          .setLabel("下一年")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= history.years.length - 1),
        new ButtonBuilder()
          .setCustomId(
            toHistoryCustomId(history.career.id, Math.max(0, history.years.length - 1), "latest"),
          )
          .setLabel("最新年度")
          .setStyle(ButtonStyle.Success)
          .setDisabled(page >= history.years.length - 1),
      ]),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Engine ${history.career.engineVersion}｜${ATTRIBUTION}`,
      ),
    );
  return {
    components: [container.toJSON()],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
