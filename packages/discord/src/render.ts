import {
  ABILITY_LABELS,
  type AbilityKey,
  CAREER_EVENTS,
  type CareerRecord,
  LEVEL_LABELS,
  overall,
  type PendingDecision,
  ROLE_LABELS,
  TRAIT_LABELS,
} from "@yakyulife/core";
import {
  ActionRowBuilder,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIContainerComponent,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
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
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(toCustomId(career.id, career.stateRevision, actionKey))
    .setLabel(label)
    .setStyle(style);
}

function decisionRows(
  career: CareerRecord,
  pending: PendingDecision | null,
): ActionRowBuilder<ButtonBuilder>[] {
  if (!pending) return [];
  if (pending.type === "training") {
    const abilities: AbilityKey[] = ["stamina", "velocity", "control", "breaking"];
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
    return [
      actionRow([
        button(career, "event_safe", "保守", ButtonStyle.Success),
        button(career, "event_normal", "正常", ButtonStyle.Primary),
        button(career, "event_bold", "豪賭", ButtonStyle.Danger),
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
    const long = pending.offers.find((offer) => offer.kind === "long");
    const short = pending.offers.find((offer) => offer.kind === "short");
    return [
      actionRow([
        button(
          career,
          "contract_long",
          `長約 ${long?.years ?? 0} 年／${long?.salary ?? 0} 萬`,
          ButtonStyle.Primary,
        ),
        button(
          career,
          "contract_short",
          `短約 ${short?.years ?? 0} 年／${short?.salary ?? 0} 萬`,
          ButtonStyle.Success,
        ),
        button(career, "contract_retire", "引退", ButtonStyle.Danger),
      ]),
    ];
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
    return `🎲 本季訓練點數：**${pending.points}**（${pending.dice.join(" + ")}）`;
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
  return "你已來到生涯後段，要繼續挑戰嗎？";
}

export function renderCareer(career: CareerRecord): CareerMessage {
  const state = career.state;
  const traits = (Object.entries(state.traits) as Array<[keyof typeof TRAIT_LABELS, boolean]>)
    .filter(([, active]) => active)
    .map(([key]) => TRAIT_LABELS[key]);
  const outcome =
    state.lastOutcome.length > 0
      ? state.lastOutcome.map((line) => `- ${line}`).join("\n")
      : "- 尚無";
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
      new TextDisplayBuilder().setContent(`-# Revision ${career.stateRevision}｜${ATTRIBUTION}`),
    );
  return {
    components: [container.toJSON()],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export type CareerComponents = readonly APIActionRowComponent<APIButtonComponent>[];
