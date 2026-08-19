import {
  ActiveCareerExistsError,
  type CareerRecord,
  type CareerService,
  DomainError,
  ENGINE_VERSION,
  ExpectedStateError,
  type Logger,
  type PlayMode,
  type PositionGroup,
  type SalaryDuelService,
  UPSTREAM_COMMIT,
} from "@yakyulife/core";
import {
  type APIContainerComponent,
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  ContainerBuilder,
  type Interaction,
  type InteractionReplyOptions,
  MessageFlags,
  type RESTPostAPIApplicationCommandsJSONBody,
  TextDisplayBuilder,
} from "discord.js";
import { actionFromKey, parseCareerCustomId } from "./actions.ts";
import { ATTRIBUTION } from "./attribution.ts";
import { registeredCommandDefinitions } from "./commands/registry.ts";
import {
  parseHistoryCustomId,
  renderCareer,
  renderCareerHistory,
  renderCareerShare,
} from "./render.ts";
import { duelShareCardFilename, type ShareCardRenderer, shareCardFilename } from "./share-card.ts";

export interface CareerFeature {
  commands: readonly RESTPostAPIApplicationCommandsJSONBody[];
  handleInteraction(interaction: Interaction): Promise<boolean>;
}

export interface CareerFeatureDependencies {
  careerService: CareerService;
  logger: Logger;
  shareCardRenderer: ShareCardRenderer;
  salaryDuelService?: SalaryDuelService;
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
    await interaction.editReply(textContainer("已在私訊中開啟球員生涯。"));
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

async function deleteStoredMessage(
  client: Client,
  channelId: string | null,
  messageId: string | null,
): Promise<void> {
  if (!channelId || !messageId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(messageId);
    await message.delete();
  } catch {
    // Database deletion must still succeed when the Discord message is already gone or inaccessible.
  }
}

async function handleStart(
  interaction: ChatInputCommandInteraction,
  service: CareerService,
): Promise<void> {
  const mode = interaction.options.getString("mode", true) as PlayMode;
  const positionGroup = interaction.options.getString("position", true) as PositionGroup;
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
      positionGroup,
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
    await interaction.editReply(textContainer("已在私訊中開啟球員生涯"));
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
    positionGroup,
  });
  await sendCareer(interaction, career, service);
}

async function handleSalaryDuel(
  interaction: ChatInputCommandInteraction,
  dependencies: CareerFeatureDependencies,
): Promise<void> {
  const service = dependencies.salaryDuelService;
  if (!service) throw new DomainError("薪資對決服務尚未啟用");
  const action = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: ephemeral });
  if (action === "create") {
    const result = await service.create({
      creatorUserId: interaction.user.id,
      creatorPlayerName: interaction.options.getString("player-name", true),
      positionGroup: interaction.options.getString("position", true) as PositionGroup,
    });
    await interaction.editReply(
      textContainer(
        `# 薪資好友賽邀請\n邀請碼：\`${result.inviteCode}\`\n守位：${result.duel.positionGroup}｜24 小時內使用 \`/career salary-duel join\` 加入。\n-# 開始後 7 天截止；生涯總收入決勝，同分比最高年薪。`,
      ),
    );
    return;
  }
  if (action === "join") {
    const code = interaction.options.getString("code", true);
    const pending = await service.getLive(interaction.user.id);
    if (pending) throw new ActiveCareerExistsError();
    const invite = await service.preview(code);
    const creator = invite?.players.find((player) => player.slot === 1);
    if (!creator?.discordUserId) throw new DomainError("邀請碼不存在或已失效");
    if (creator.discordUserId === interaction.user.id)
      throw new DomainError("不能加入自己建立的好友賽");
    // Joining is atomic in Postgres. Both DM placeholders prove the players are reachable first.
    const joinerDm = await interaction.user.createDM();
    const joinerPlaceholder = await joinerDm.send("正在建立薪資好友賽…");
    let creatorPlaceholder: Awaited<ReturnType<typeof joinerDm.send>> | null = null;
    try {
      const creatorUser = await interaction.client.users.fetch(creator.discordUserId);
      const creatorDm = await creatorUser.createDM();
      creatorPlaceholder = await creatorDm.send("正在建立薪資好友賽…");
      const result = await service.join({
        inviteCode: code,
        joinerUserId: interaction.user.id,
        joinerPlayerName: interaction.options.getString("player-name", true),
      });
      const [creatorCareer, joinerCareer] = result.careers;
      await creatorPlaceholder.edit(renderCareer(creatorCareer));
      await joinerPlaceholder.edit(renderCareer(joinerCareer));
      await dependencies.careerService.updateLocation(
        creatorCareer.id,
        creatorCareer.discordUserId,
        {
          guildId: null,
          channelId: creatorDm.id,
          messageId: creatorPlaceholder.id,
        },
      );
      await dependencies.careerService.updateLocation(joinerCareer.id, joinerCareer.discordUserId, {
        guildId: null,
        channelId: joinerDm.id,
        messageId: joinerPlaceholder.id,
      });
      await interaction.editReply(
        textContainer(
          `好友賽已開始，遊戲畫面已送到雙方私訊。\nSeed commitment：\`${result.duel.seedCommitment}\`\n-# 分數與 raw seed 會在對局結束後公開。`,
        ),
      );
    } catch (error) {
      await joinerPlaceholder.delete().catch(() => undefined);
      await creatorPlaceholder?.delete().catch(() => undefined);
      throw error;
    }
    return;
  }
  if (action === "status") {
    const duel = await service.getStatus(interaction.user.id);
    if (!duel) {
      await interaction.editReply(textContainer("目前沒有等待中或進行中的薪資好友賽"));
      return;
    }
    const terminal = !["pending", "active"].includes(duel.status);
    const progress = duel.players
      .map((player) =>
        terminal
          ? `玩家 ${player.slot}：${player.status}｜累積 ${player.totalEarnings?.toLocaleString("zh-TW") ?? "—"} 萬｜最高 ${player.peakAnnualSalary?.toLocaleString("zh-TW") ?? "—"} 萬`
          : `玩家 ${player.slot}：${player.status}`,
      )
      .join("\n");
    await interaction.editReply(
      textContainer(
        `# 薪資好友賽狀態\n${duel.status}｜${duel.positionGroup}\n${progress}${terminal ? `\n勝者：${duel.winnerSlot ? `玩家 ${duel.winnerSlot}` : "和局／無結果"}\nSeed：\`${duel.revealedSeed ?? "已清除"}\`` : ""}\n-# 對局結束前不顯示分數與 raw seed。`,
      ),
    );
    return;
  }
  const cancelled = await service.cancel(interaction.user.id);
  await interaction.editReply(
    textContainer(cancelled ? "已取消等待中的邀請" : "目前沒有可取消的邀請"),
  );
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
  const abilities = Object.entries(state.abilities)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${key} ${value}`)
    .join("｜");
  const salary =
    state.stage === "professional"
      ? `年薪 ${state.contract.annualSalary} 萬｜剩餘 ${state.contract.yearsRemaining} 年｜累積 ${state.contract.totalEarnings} 萬`
      : "尚未取得職業合約";
  await interaction.editReply(
    textContainer(
      `**${state.name}**｜${state.year} 年｜${state.age} 歲｜${state.team}\n` +
        `${abilities}\n${salary}（新臺幣萬元・遊戲值）\n` +
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
  const liveDuel = dependencies.salaryDuelService
    ? await dependencies.salaryDuelService.getLive(interaction.user.id)
    : null;
  const seedMustStayPrivate = liveDuel?.players.some(
    (player) => player.careerId === history.career.id,
  );
  if (seedMustStayPrivate) {
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
  const group = interaction.options.getSubcommandGroup(false);
  if (group === "salary-duel") return handleSalaryDuel(interaction, dependencies);
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
    const active = await dependencies.careerService.getActive(interaction.user.id);
    const duel = dependencies.salaryDuelService
      ? await dependencies.salaryDuelService.getStatus(interaction.user.id)
      : null;
    await deleteStoredMessage(
      interaction.client,
      active?.location.channelId ?? null,
      active?.location.messageId ?? null,
    );
    const duelPlayer = duel?.players.find((player) => player.discordUserId === interaction.user.id);
    await deleteStoredMessage(
      interaction.client,
      duelPlayer?.resultChannelId ?? null,
      duelPlayer?.resultMessageId ?? null,
    );
    const count = await dependencies.careerService.deleteData(interaction.user.id);
    await interaction.editReply(
      textContainer(
        `已刪除 ${count} 筆生涯資料並取消／匿名化相關好友賽；此操作無法復原。Bot 已嘗試移除可定位的遊戲與結果訊息，但無法回收他人轉傳或另存的圖片。`,
      ),
    );
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
    const liveDuel = dependencies.salaryDuelService
      ? await dependencies.salaryDuelService.getLive(interaction.user.id)
      : null;
    if (liveDuel?.players.some((player) => player.careerId === career.id)) {
      await interaction.editReply(
        textContainer("好友賽結束前不可產生分享卡；raw seed 與分數會在正式結算後公開"),
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
    if (result.career.summary && dependencies.salaryDuelService) {
      await deliverPendingSalaryDuelResults(
        interaction.client,
        dependencies.salaryDuelService,
        dependencies.shareCardRenderer,
        dependencies.logger,
      );
    }
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

export async function deliverPendingSalaryDuelResults(
  client: Client,
  service: SalaryDuelService,
  renderer: ShareCardRenderer,
  logger: Logger,
): Promise<void> {
  const duels = await service.findUndeliveredResults();
  for (const duel of duels) {
    const lines = duel.players.map(
      (player) =>
        `玩家 ${player.slot}｜累積 ${player.totalEarnings?.toLocaleString("zh-TW") ?? "—"} 萬｜最高 ${player.peakAnnualSalary?.toLocaleString("zh-TW") ?? "—"} 萬`,
    );
    const content = `# 薪資好友賽結果\n${lines.join("\n")}\n${duel.winnerSlot ? `勝者：玩家 ${duel.winnerSlot}` : duel.status === "invalid" ? "驗證失敗，本場不計勝負" : "本場和局／無結果"}\nSeed：\`${duel.revealedSeed ?? "已清除"}\`\nRuleset：${duel.rulesetVersion}`;
    const png = await renderer.renderDuel(duel);
    const filename = duelShareCardFilename(duel.id);
    for (const player of duel.players) {
      if (!player.discordUserId || player.resultMessageId) continue;
      try {
        const user = await client.users.fetch(player.discordUserId);
        const dm = await user.createDM();
        const message = await dm.send({
          ...textContainer(content),
          files: [new AttachmentBuilder(png, { name: filename })],
        });
        await service.markResultDelivered(duel.id, player.slot, dm.id, message.id);
      } catch (error) {
        logger.warn("Salary duel result delivery deferred", {
          duelId: duel.id,
          slot: player.slot,
          reason: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  }
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
  const severity = careerErrorSeverity(error);
  const reason = error instanceof Error ? error.name : "UnknownError";
  if (severity === "info")
    logger.info("Career interaction rejected", { interactionId: interaction.id, reason });
  else if (severity === "warn")
    logger.warn("Career interaction rejected", { interactionId: interaction.id, reason });
  else logger.error("Career interaction failed", error, { interactionId: interaction.id });
  const content =
    error instanceof DomainError || error instanceof ActiveCareerExistsError
      ? error.message
      : "服務暫時無法使用；本次操作未消耗行動，請稍後再試";
  if (interaction.isRepliable()) {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(textContainer(content)).catch(() => undefined);
    } else if (interaction.replied) {
      await interaction.followUp(ephemeralTextContainer(content)).catch(() => undefined);
    } else {
      await interaction.reply(ephemeralTextContainer(content)).catch(() => undefined);
    }
  }
}

export function careerErrorSeverity(error: unknown): "info" | "warn" | "error" {
  if (error instanceof ExpectedStateError) return "info";
  if (error instanceof DomainError) return "warn";
  return "error";
}

export function createCareerFeature(dependencies: CareerFeatureDependencies): CareerFeature {
  return {
    commands: registeredCommandDefinitions,
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
