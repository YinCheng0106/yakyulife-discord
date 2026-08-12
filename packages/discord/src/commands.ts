import { type RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from "discord.js";

export const careerCommands: readonly RESTPostAPIApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName("career")
    .setDescription("開始或管理 YaKyoLife 投手生涯")
    .addSubcommand((command) =>
      command
        .setName("start")
        .setDescription("開始新的投手生涯")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("遊戲訊息顯示位置")
            .setRequired(true)
            .addChoices({ name: "私訊", value: "dm" }, { name: "目前頻道", value: "channel" }),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("球員姓名（1–10 字）")
            .setMinLength(1)
            .setMaxLength(10),
        )
        .addStringOption((option) =>
          option
            .setName("seed")
            .setDescription("重播種子（1–24 字）")
            .setMinLength(1)
            .setMaxLength(24),
        ),
    )
    .addSubcommand((command) =>
      command.setName("continue").setDescription("續玩目前生涯並重建訊息"),
    )
    .addSubcommand((command) => command.setName("status").setDescription("查看目前生涯狀態"))
    .addSubcommand((command) => command.setName("abandon").setDescription("放棄目前進行中的生涯"))
    .addSubcommand((command) =>
      command.setName("share").setDescription("產生已完成生涯的 PNG 分享卡"),
    )
    .addSubcommand((command) =>
      command.setName("delete-data").setDescription("刪除自己的所有 YaKyoLife 資料"),
    )
    .addSubcommand((command) => command.setName("about").setDescription("查看來源、授權與版本資訊"))
    .toJSON(),
];
