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
  type APIContainerComponent,
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  ContainerBuilder,
  type Interaction,
  type InteractionReplyOptions,
  MessageFlags,
  type RESTPostAPIApplicationCommandsJSONBody,
  TextDisplayBuilder,
} from "discord.js";
import { actionFromKey, parseCareerCustomId } from "./actions.ts";
import { ATTRIBUTION } from "./attribution.ts";
import { careerCommands } from "./commands.ts";
import {
  parseHistoryCustomId,
  renderCareer,
  renderCareerHistory,
  renderCareerShare,
} from "./render.ts";
import { type ShareCardRenderer, shareCardFilename } from "./share-card.ts";

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

interface TextContainerMessage {
  components: APIContainerComponent[];
  flags: MessageFlags.IsComponentsV2;
  allowedMentions: { parse: [] };
}

function textContainer(content: string): TextContainerMessage {
  return {
    components: [
      new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .toJSON(),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function ephemeralTextContainer(content: string): InteractionReplyOptions {
  return {
    ...textContainer(content),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

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
    await interaction.editReply(textContainer("已在私訊中開啟投手生涯。"));
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
    const career = await service.start({
      discordUserId: interaction.user.id,
      name:
        interaction.options.getString("name") ??
        Array.from(interaction.user.displayName).slice(0, 10).join(""),
      seed: interaction.options.getString("seed") ?? crypto.randomUUID().slice(0, 12),
      playMode: mode,
      location: { guildId: null, channelId: dm.id, messageId: null },
    });
    const message = await dm.send(renderCareer(career)).catch(async (error: unknown) => {
      await service.abandon(career.id, career.discordUserId).catch(() => undefined);
      throw error;
    });
    await service.updateLocation(career.id, career.discordUserId, {
      guildId: null,
      channelId: dm.id,
      messageId: message.id,
    });
    await interaction.editReply(textContainer("已在私訊中開啟投手生涯"));
    return;
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
    await interaction.editReply(textContainer("目前沒有進行中的生涯，請使用 `/career start`"));
    return;
  }
  if (await refreshStoredMessage(interaction, career)) {
    await interaction.editReply(
      textContainer(
        career.playMode === "dm" ? "已更新原本的私訊遊戲畫面" : "已更新原本的頻道遊戲畫面",
      ),
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
    textContainer("已在目前頻道重建遊戲訊息。無法找回已刪除的舊訊息時，請以新訊息為準"),
  );
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  service: CareerService,
): Promise<void> {
  await interaction.deferReply({ flags: ephemeral });
  const career = await service.getActive(interaction.user.id);
  if (!career) {
    await interaction.editReply(textContainer("目前沒有進行中的生涯"));
    return;
  }
  const state = career.state;
  await interaction.editReply(
    textContainer(
      `**${state.name}**｜${state.year} 年｜${state.age} 歲｜${state.team}\n` +
        `體力 ${state.abilities.stamina}｜球速 ${state.abilities.velocity}｜控球 ${state.abilities.control}｜變化球 ${state.abilities.breaking}\n` +
        `Revision ${career.stateRevision}｜模式：${career.playMode === "dm" ? "私訊" : "頻道"}`,
    ),
  );
}

async function handleHistory(
  interaction: ChatInputCommandInteraction,
  dependencies: CareerFeatureDependencies,
): Promise<void> {
  await interaction.deferReply({ flags: ephemeral });
  const selected = interaction.options.getString("career") ?? undefined;
  const history = await dependencies.careerService.getHistory(interaction.user.id, selected);
  if (!history) {
    await interaction.editReply(textContainer("找不到可查看的生涯紀錄"));
    return;
  }
  if (!history.career.summary) {
    await interaction.editReply(renderCareerHistory(history, history.years.length - 1));
    return;
  }
  const filename = shareCardFilename(history.career.id);
  const png = await dependencies.shareCardRenderer.render(history.career);
  await interaction.editReply({
    ...renderCareerHistory(history, history.years.length - 1, filename),
    files: [new AttachmentBuilder(png, { name: filename })],
  });
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  service: CareerService,
): Promise<void> {
  const focused = interaction.options.getFocused().toLocaleLowerCase("zh-TW");
  const careers = await service.listCareers(interaction.user.id);
  await interaction.respond(
    careers
      .filter((career) =>
        `${career.name} ${career.id.slice(0, 8)} ${career.startYear} ${career.endYear}`
          .toLocaleLowerCase("zh-TW")
          .includes(focused),
      )
      .slice(0, 25)
      .map((career) => ({
        name: `${career.name}｜${career.startYear}–${career.endYear}｜${career.status === "active" ? "進行中" : career.status === "completed" ? "已完成" : "已放棄"}｜${career.id.slice(0, 8)}`.slice(
          0,
          100,
        ),
        value: career.id,
      })),
  );
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  dependencies: CareerFeatureDependencies,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "start") return handleStart(interaction, dependencies.careerService);
  if (subcommand === "continue") return handleContinue(interaction, dependencies.careerService);
  if (subcommand === "status") return handleStatus(interaction, dependencies.careerService);
  if (subcommand === "history") return handleHistory(interaction, dependencies);
  if (subcommand === "abandon") {
    await interaction.deferReply({ flags: ephemeral });
    const active = await dependencies.careerService.getActive(interaction.user.id);
    const abandoned = active
      ? await dependencies.careerService.abandon(active.id, interaction.user.id)
      : false;
    await interaction.editReply(
      textContainer(abandoned ? "已放棄目前生涯" : "目前沒有可放棄的生涯"),
    );
    return;
  }
  if (subcommand === "delete-data") {
    await interaction.deferReply({ flags: ephemeral });
    const count = await dependencies.careerService.deleteData(interaction.user.id);
    await interaction.editReply(textContainer(`已刪除 ${count} 筆生涯資料；此操作無法復原`));
    return;
  }
  if (subcommand === "share") {
    await interaction.deferReply({ flags: ephemeral });
    const career = await dependencies.careerService.getLatestCompleted(interaction.user.id);
    if (!career?.summary) {
      await interaction.editReply(
        textContainer("目前沒有已完成且可分享的生涯。完成生涯後即可產生 PNG 卡片"),
      );
      return;
    }
    const png = await dependencies.shareCardRenderer.render(career);
    const filename = shareCardFilename(career.id);
    await interaction.editReply({
      ...renderCareerShare(filename, career.state.name),
      files: [new AttachmentBuilder(png, { name: filename })],
    });
    return;
  }
  await interaction.reply(
    ephemeralTextContainer(
      `# YaKyuLife Discord Bot\nEngine \`${ENGINE_VERSION}\`｜上游 \`${UPSTREAM_COMMIT.slice(0, 8)}\`\n${ATTRIBUTION}\n授權：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)`,
    ),
  );
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
    await interaction.followUp(ephemeralTextContainer("這個操作已不受目前版本支援"));
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
    await interaction.followUp(ephemeralTextContainer("畫面已過期，請以最新遊戲訊息為準"));
    return;
  }
  if (result.status === "forbidden") {
    await interaction.followUp(ephemeralTextContainer("只有這段生涯的擁有者可以操作"));
    return;
  }
  if (result.status === "inactive") {
    await interaction.followUp(ephemeralTextContainer("這段生涯已經結束或被放棄"));
    return;
  }
  await interaction.followUp(ephemeralTextContainer("找不到這段生涯，資料可能已刪除"));
}

async function handleHistoryButton(
  interaction: ButtonInteraction,
  dependencies: CareerFeatureDependencies,
): Promise<void> {
  const parsed = parseHistoryCustomId(interaction.customId);
  if (!parsed) return;
  await interaction.deferUpdate();
  const history = await dependencies.careerService.getHistory(interaction.user.id, parsed.careerId);
  if (!history) {
    await interaction.followUp(ephemeralTextContainer("找不到這段生涯，或你沒有查看權限"));
    return;
  }
  await interaction.editReply(
    renderCareerHistory(
      history,
      parsed.page,
      history.career.summary ? shareCardFilename(history.career.id) : undefined,
    ),
  );
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
      : "服務暫時無法使用；本次操作未消耗行動，請稍後再試";
  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(ephemeralTextContainer(content)).catch(() => undefined);
    } else {
      await interaction.reply(ephemeralTextContainer(content)).catch(() => undefined);
    }
  }
}

export function createCareerFeature(dependencies: CareerFeatureDependencies): CareerFeature {
  return {
    commands: careerCommands,
    async handleInteraction(interaction) {
      const isCareerAutocomplete =
        interaction.isAutocomplete() && interaction.commandName === "career";
      const isCareerCommand =
        interaction.isChatInputCommand() && interaction.commandName === "career";
      const isCareerButton = interaction.isButton() && interaction.customId.startsWith("career:");
      const isHistoryButton =
        interaction.isButton() && interaction.customId.startsWith("career-history:");
      if (!isCareerAutocomplete && !isCareerCommand && !isCareerButton && !isHistoryButton)
        return false;
      try {
        if (isCareerAutocomplete) await handleAutocomplete(interaction, dependencies.careerService);
        else if (isCareerCommand) await handleCommand(interaction, dependencies);
        else if (isHistoryButton) await handleHistoryButton(interaction, dependencies);
        else if (isCareerButton) await handleButton(interaction, dependencies);
      } catch (error) {
        await reportError(interaction, error, dependencies.logger);
      }
      return true;
    },
  };
}

export type ApplicationCommandDefinition = RESTPostAPIApplicationCommandsJSONBody;
