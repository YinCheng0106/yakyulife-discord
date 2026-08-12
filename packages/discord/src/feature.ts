import {
  ActiveCareerExistsError,
  type CareerRecord,
  type CareerService,
  DomainError,
  ENGINE_VERSION,
  type Logger,
  type PlayMode,
  UPSTREAM_COMMIT,
} from "@yakyulife/core";
import {
  AttachmentBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  MessageFlags,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { actionFromKey, parseCareerCustomId } from "./actions.ts";
import { ATTRIBUTION } from "./attribution.ts";
import { careerCommands } from "./commands.ts";
import { renderCareer } from "./render.ts";
import type { ShareCardRenderer } from "./share-card.ts";

export interface CareerFeature {
  commands: readonly RESTPostAPIApplicationCommandsJSONBody[];
  handleInteraction(interaction: Interaction): Promise<boolean>;
}

export interface CareerFeatureDependencies {
  careerService: CareerService;
  logger: Logger;
  shareCardRenderer: ShareCardRenderer;
}

const ephemeral = MessageFlags.Ephemeral;

async function editCareerMessage(
  interaction: ButtonInteraction,
  career: CareerRecord,
): Promise<void> {
  await interaction.message.edit(renderCareer(career));
}

async function sendCareer(
  interaction: ChatInputCommandInteraction,
  career: CareerRecord,
  service: CareerService,
): Promise<void> {
  if (career.playMode === "dm") {
    const dm = await interaction.user.createDM();
    const message = await dm.send(renderCareer(career));
    await service.updateLocation(career.id, career.discordUserId, {
      guildId: null,
      channelId: dm.id,
      messageId: message.id,
    });
    await interaction.editReply({
      content: "已在私訊中開啟投手生涯。",
      allowedMentions: { parse: [] },
    });
    return;
  }
  await interaction.editReply(renderCareer(career));
  const message = await interaction.fetchReply();
  await service.updateLocation(career.id, career.discordUserId, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: message.id,
  });
}

async function refreshStoredMessage(
  interaction: ChatInputCommandInteraction,
  career: CareerRecord,
): Promise<boolean> {
  const { channelId, messageId } = career.location;
  if (!channelId || !messageId) return false;
  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) return false;
    const message = await channel.messages.fetch(messageId);
    await message.edit(renderCareer(career));
    return true;
  } catch {
    return false;
  }
}

async function handleStart(
  interaction: ChatInputCommandInteraction,
  service: CareerService,
): Promise<void> {
  const mode = interaction.options.getString("mode", true) as PlayMode;
  await interaction.deferReply({ flags: mode === "dm" ? ephemeral : undefined });

  if (mode === "dm") {
    const dm = await interaction.user.createDM();
    const probe = await dm.send({
      content: "正在建立 YaKyuLife 投手生涯……",
      allowedMentions: { parse: [] },
    });
    try {
      const career = await service.start({
        discordUserId: interaction.user.id,
        name:
          interaction.options.getString("name") ??
          Array.from(interaction.user.displayName).slice(0, 10).join(""),
        seed: interaction.options.getString("seed") ?? crypto.randomUUID().slice(0, 12),
        playMode: mode,
        location: { guildId: null, channelId: dm.id, messageId: probe.id },
      });
      await probe.edit(renderCareer(career));
      await interaction.editReply("已在私訊中開啟投手生涯。");
      return;
    } catch (error) {
      await probe.delete().catch(() => undefined);
      throw error;
    }
  }

  const career = await service.start({
    discordUserId: interaction.user.id,
    name:
      interaction.options.getString("name") ??
      Array.from(interaction.user.displayName).slice(0, 10).join(""),
    seed: interaction.options.getString("seed") ?? crypto.randomUUID().slice(0, 12),
    playMode: mode,
    location: {
      guildId: mode === "channel" ? interaction.guildId : null,
      channelId: mode === "channel" ? interaction.channelId : null,
      messageId: null,
    },
  });
  await sendCareer(interaction, career, service);
}

async function handleContinue(
  interaction: ChatInputCommandInteraction,
  service: CareerService,
): Promise<void> {
  await interaction.deferReply({ flags: ephemeral });
  const career = await service.getActive(interaction.user.id);
  if (!career) {
    await interaction.editReply("目前沒有進行中的生涯，請使用 `/career start`。");
    return;
  }
  if (await refreshStoredMessage(interaction, career)) {
    await interaction.editReply(
      career.playMode === "dm" ? "已更新原本的私訊遊戲畫面。" : "已更新原本的頻道遊戲畫面。",
    );
    return;
  }
  if (career.playMode === "dm") {
    await sendCareer(interaction, career, service);
    return;
  }
  const channel = interaction.channel;
  if (!channel?.isSendable()) throw new DomainError("目前頻道無法傳送訊息");
  const message = await channel.send(renderCareer(career));
  await service.updateLocation(career.id, career.discordUserId, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: message.id,
  });
  await interaction.editReply(
    "已在目前頻道重建遊戲訊息。無法找回已刪除的舊訊息時，請以新訊息為準。",
  );
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  service: CareerService,
): Promise<void> {
  await interaction.deferReply({ flags: ephemeral });
  const career = await service.getActive(interaction.user.id);
  if (!career) {
    await interaction.editReply("目前沒有進行中的生涯。");
    return;
  }
  const state = career.state;
  await interaction.editReply({
    content:
      `**${state.name}**｜${state.year} 年｜${state.age} 歲｜${state.team}\n` +
      `體力 ${state.abilities.stamina}｜球速 ${state.abilities.velocity}｜控球 ${state.abilities.control}｜變化球 ${state.abilities.breaking}\n` +
      `Revision ${career.stateRevision}｜模式：${career.playMode === "dm" ? "私訊" : "頻道"}`,
    allowedMentions: { parse: [] },
  });
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  dependencies: CareerFeatureDependencies,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "start") return handleStart(interaction, dependencies.careerService);
  if (subcommand === "continue") return handleContinue(interaction, dependencies.careerService);
  if (subcommand === "status") return handleStatus(interaction, dependencies.careerService);
  if (subcommand === "abandon") {
    await interaction.deferReply({ flags: ephemeral });
    const active = await dependencies.careerService.getActive(interaction.user.id);
    const abandoned = active
      ? await dependencies.careerService.abandon(active.id, interaction.user.id)
      : false;
    await interaction.editReply(abandoned ? "已放棄目前生涯。" : "目前沒有可放棄的生涯。");
    return;
  }
  if (subcommand === "delete-data") {
    await interaction.deferReply({ flags: ephemeral });
    const count = await dependencies.careerService.deleteData(interaction.user.id);
    await interaction.editReply(`已刪除 ${count} 筆生涯資料；此操作無法復原。`);
    return;
  }
  if (subcommand === "share") {
    await interaction.deferReply({ flags: ephemeral });
    const career = await dependencies.careerService.getLatestCompleted(interaction.user.id);
    if (!career?.summary) {
      await interaction.editReply("目前沒有已完成且可分享的生涯。完成生涯後即可產生 PNG 卡片。");
      return;
    }
    const png = await dependencies.shareCardRenderer.render(career);
    await interaction.editReply({
      content: ATTRIBUTION,
      files: [new AttachmentBuilder(png, { name: `yakyulife-${career.id}.png` })],
      allowedMentions: { parse: [] },
    });
    return;
  }
  await interaction.reply({
    content: `**YaKyuLife Discord Bot**\nEngine ${ENGINE_VERSION}｜上游 ${UPSTREAM_COMMIT.slice(0, 8)}\n${ATTRIBUTION}\n授權：https://creativecommons.org/licenses/by-nc/4.0/`,
    flags: ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function handleButton(
  interaction: ButtonInteraction,
  dependencies: CareerFeatureDependencies,
): Promise<void> {
  const parsed = parseCareerCustomId(interaction.customId);
  if (!parsed) return;
  await interaction.deferUpdate();
  const action = actionFromKey(parsed.actionKey);
  if (!action) {
    await interaction.followUp({ content: "這個操作已不受目前版本支援。", flags: ephemeral });
    return;
  }
  const result = await dependencies.careerService.applyAction({
    careerId: parsed.careerId,
    discordUserId: interaction.user.id,
    interactionId: interaction.id,
    expectedRevision: parsed.revision,
    action,
  });
  if (result.status === "applied") {
    await editCareerMessage(interaction, result.career);
    return;
  }
  if (result.status === "duplicate") return;
  if (result.status === "stale") {
    await interaction.followUp({ content: "畫面已過期，請以最新遊戲訊息為準。", flags: ephemeral });
    return;
  }
  if (result.status === "forbidden") {
    await interaction.followUp({ content: "只有這段生涯的擁有者可以操作。", flags: ephemeral });
    return;
  }
  if (result.status === "inactive") {
    await interaction.followUp({ content: "這段生涯已經結束或被放棄。", flags: ephemeral });
    return;
  }
  await interaction.followUp({ content: "找不到這段生涯，資料可能已刪除。", flags: ephemeral });
}

async function reportError(
  interaction: Interaction,
  error: unknown,
  logger: Logger,
): Promise<void> {
  logger.error("Career interaction failed", error, { interactionId: interaction.id });
  const content =
    error instanceof DomainError || error instanceof ActiveCareerExistsError
      ? error.message
      : "服務暫時無法使用；本次操作未消耗行動，請稍後再試。";
  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction
        .followUp({ content, flags: ephemeral, allowedMentions: { parse: [] } })
        .catch(() => undefined);
    } else {
      await interaction
        .reply({ content, flags: ephemeral, allowedMentions: { parse: [] } })
        .catch(() => undefined);
    }
  }
}

export function createCareerFeature(dependencies: CareerFeatureDependencies): CareerFeature {
  return {
    commands: careerCommands,
    async handleInteraction(interaction) {
      const isCareerCommand =
        interaction.isChatInputCommand() && interaction.commandName === "career";
      const isCareerButton = interaction.isButton() && interaction.customId.startsWith("career:");
      if (!isCareerCommand && !isCareerButton) return false;
      try {
        if (isCareerCommand) await handleCommand(interaction, dependencies);
        else if (isCareerButton) await handleButton(interaction, dependencies);
      } catch (error) {
        await reportError(interaction, error, dependencies.logger);
      }
      return true;
    },
  };
}

export type ApplicationCommandDefinition = RESTPostAPIApplicationCommandsJSONBody;
