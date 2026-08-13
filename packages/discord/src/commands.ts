import { type RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from "discord.js";

export const careerCommands: readonly RESTPostAPIApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName("career")
    .setNameLocalizations({ "zh-TW": "生涯" })
    .setDescription("開始或管理 YaKyuLife 棒球生涯")
    .addSubcommand((command) =>
      command
        .setName("start")
        .setNameLocalizations({ "zh-TW": "開始" })
        .setDescription("開始新的棒球生涯")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setNameLocalizations({ "zh-TW": "模式" })
            .setDescription("遊戲訊息顯示位置")
            .setRequired(true)
            .addChoices({ name: "私訊", value: "dm" }, { name: "目前頻道", value: "channel" }),
        )
        .addStringOption((option) =>
          option
            .setName("position")
            .setNameLocalizations({ "zh-TW": "守位" })
            .setDescription("生涯守位類別")
            .setRequired(true)
            .addChoices(
              { name: "投手", value: "pitcher" },
              { name: "捕手", value: "catcher" },
              { name: "內野手", value: "infielder" },
              { name: "外野手", value: "outfielder" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setNameLocalizations({ "zh-TW": "姓名" })
            .setDescription("球員姓名（1–10 字）")
            .setMinLength(1)
            .setMaxLength(10),
        )
        .addStringOption((option) =>
          option
            .setName("seed")
            .setNameLocalizations({ "zh-TW": "種子" })
            .setDescription("重播種子（1–24 字）")
            .setMinLength(1)
            .setMaxLength(24),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("salary-duel")
        .setNameLocalizations({ "zh-TW": "薪資對決" })
        .setDescription("建立或加入同種子薪資好友賽")
        .addSubcommand((command) =>
          command
            .setName("create")
            .setNameLocalizations({ "zh-TW": "建立" })
            .setDescription("建立 24 小時有效的好友賽邀請碼")
            .addStringOption((option) =>
              option
                .setName("position")
                .setDescription("雙方守位類別")
                .setRequired(true)
                .addChoices(
                  { name: "投手", value: "pitcher" },
                  { name: "捕手", value: "catcher" },
                  { name: "內野手", value: "infielder" },
                  { name: "外野手", value: "outfielder" },
                ),
            )
            .addStringOption((option) =>
              option
                .setName("player-name")
                .setDescription("球員姓名")
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(10),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("join")
            .setNameLocalizations({ "zh-TW": "加入" })
            .setDescription("使用邀請碼加入好友賽")
            .addStringOption((option) =>
              option
                .setName("code")
                .setDescription("12 字元邀請碼")
                .setRequired(true)
                .setMinLength(12)
                .setMaxLength(12),
            )
            .addStringOption((option) =>
              option
                .setName("player-name")
                .setDescription("球員姓名")
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(10),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("status")
            .setNameLocalizations({ "zh-TW": "狀態" })
            .setDescription("查看目前好友賽狀態"),
        )
        .addSubcommand((command) =>
          command
            .setName("cancel")
            .setNameLocalizations({ "zh-TW": "取消" })
            .setDescription("取消尚未開始的邀請"),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("continue")
        .setNameLocalizations({ "zh-TW": "續玩" })
        .setDescription("續玩目前生涯並重建訊息"),
    )
    .addSubcommand((command) =>
      command
        .setName("status")
        .setNameLocalizations({ "zh-TW": "狀態" })
        .setDescription("查看目前生涯狀態"),
    )
    .addSubcommand((command) =>
      command
        .setName("history")
        .setNameLocalizations({ "zh-TW": "歷史" })
        .setDescription("查看自己進行中或已完成的逐年生涯紀錄")
        .addStringOption((option) =>
          option
            .setName("career")
            .setNameLocalizations({ "zh-TW": "生涯" })
            .setDescription("選擇要查看的生涯")
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("abandon")
        .setNameLocalizations({ "zh-TW": "放棄" })
        .setDescription("放棄目前進行中的生涯"),
    )
    .addSubcommand((command) =>
      command
        .setName("share")
        .setNameLocalizations({ "zh-TW": "分享" })
        .setDescription("產生已完成生涯的 PNG 分享卡"),
    )
    .addSubcommand((command) =>
      command
        .setName("delete-data")
        .setNameLocalizations({ "zh-TW": "刪除資料" })
        .setDescription("刪除自己的所有 YaKyuLife 資料"),
    )
    .addSubcommand((command) =>
      command
        .setName("about")
        .setNameLocalizations({ "zh-TW": "關於" })
        .setDescription("查看來源、授權與版本資訊"),
    )
    .toJSON(),
];
