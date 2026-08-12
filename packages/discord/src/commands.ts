import { type RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from "discord.js";

export const careerCommands: readonly RESTPostAPIApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName("career")
    .setNameLocalizations({ "zh-TW" : "生涯"})
    .setDescription("開始或管理 YaKyuLife 投手生涯")
    .addSubcommand((command) =>
      command
        .setName("start")
        .setNameLocalizations({ "zh-TW" : "開始" })
        .setDescription("開始新的投手生涯")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setNameLocalizations({ "zh-TW" : "模式" })
            .setDescription("遊戲訊息顯示位置")
            .setRequired(true)
            .addChoices({ name: "私訊", value: "dm" }, { name: "目前頻道", value: "channel" }),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setNameLocalizations({ "zh-TW" : "姓名" })
            .setDescription("球員姓名（1–10 字）")
            .setMinLength(1)
            .setMaxLength(10),
        )
        .addStringOption((option) =>
          option
            .setName("seed")
            .setNameLocalizations({ "zh-TW" : "種子" })
            .setDescription("重播種子（1–24 字）")
            .setMinLength(1)
            .setMaxLength(24),
        ),
    )
    .addSubcommand((command) =>
      command.setName("continue").setNameLocalizations({ "zh-TW" : "續玩" }).setDescription("續玩目前生涯並重建訊息"),
    )
    .addSubcommand((command) => command.setName("status").setNameLocalizations({ "zh-TW" : "狀態" }).setDescription("查看目前生涯狀態"))
    .addSubcommand((command) => command.setName("abandon").setNameLocalizations({ "zh-TW" : "放棄" }).setDescription("放棄目前進行中的生涯"))
    .addSubcommand((command) =>
      command.setName("share").setNameLocalizations({ "zh-TW" : "分享" }).setDescription("產生已完成生涯的 PNG 分享卡"),
    )
    .addSubcommand((command) =>
      command.setName("delete-data").setNameLocalizations({ "zh-TW" : "刪除資料" }).setDescription("刪除自己的所有 YaKyuLife 資料"),
    )
    .addSubcommand((command) => command.setName("about").setNameLocalizations({ "zh-TW" : "關於" }).setDescription("查看來源、授權與版本資訊"))
    .toJSON(),
];
