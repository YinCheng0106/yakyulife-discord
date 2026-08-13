# YaKyuLife Discord Bot

YaKyuLife Discord Bot 是以 Bun 1.3.14、TypeScript ESM、Discord.js 與 Supabase PostgreSQL 製作的非營利投手生涯模擬 Bot。投手模式提供逐骰配點、高中與大學選秀、中職、日職、美職、韓職、澳職、國際賽、人生事件、傷病、TJ、合約、FA、衰退、逐年生涯紀錄、引退與 PNG 分享卡。

本專案改編自 [LeoGGcat／YaKyuLife](https://github.com/LeoGGcat/yakyulife)，規則基準為 [`913cad27`](https://github.com/LeoGGcat/yakyulife/commit/913cad27db86bda79cbd53dc5666ab15d28c5d2d)，依 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 授權。這是獨立改作，不代表原作者背書，不得用於廣告、付費功能或其他商業用途。

## 架構

```text
apps/bot                 Discord client、composition root、health endpoint
packages/core            純 TypeScript reducer、規則、ports、use cases
packages/postgres        Bun.SQL repository、row lock、revision、state 邊界驗證
packages/discord         Commands、Components V2、renderers、PNG 分享卡
supabase/migrations      唯一正式 schema 來源
scripts                  command deploy、migration、模擬、上游檢查
tests/integration        service 與可選的 Supabase smoke tests
```

`@yakyulife/core` 不依賴 Discord、SQL、Bun runtime 或檔案系統。Bot 使用顯式 `createCareerFeature()` 註冊功能，不會掃描資料夾或動態把服務掛在 Discord client 上。

## 開始使用

需求：Bun `1.3.14`、Discord Application、Supabase PostgreSQL。請勿使用 Node、npm、pnpm 或 yarn 安裝與執行本專案。

```bash
bun install --frozen-lockfile
cp .env.example .env
bunx supabase login
bunx supabase link --project-ref <PROJECT_REF>
bun run db:push:dry-run
bun run db:push
bun run discord:deploy
bun run dev
```

`PROJECT_REF` 可從 Supabase Dashboard 專案網址 `/project/<PROJECT_REF>` 取得。如果不想 link，也可以在 `.env` 設定具 DDL 權限的 `MIGRATION_DATABASE_URL`；`db:push` 不會使用低權限 runtime `DATABASE_URL`。

`DATABASE_URL` 請使用專用資料庫登入角色。長時間執行的 Bot 在支援 IPv6 的環境使用 direct connection；IPv4-only 環境使用 Supavisor session mode，不使用 serverless transaction mode。runtime 登入角色必須能 `SET ROLE yakyulife_runtime`，但不得擁有 DDL 權限。

若 `bun run db:doctor` 確認 direct endpoint 只有 IPv6 且無法連線，在完成 `supabase link` 後可執行 `bun run db:use-session-pooler`，安全地沿用目前密碼並切換到 CLI 提供的 session endpoint；指令不會輸出完整 URL 或密碼。

正式環境先執行：

```bash
bun install --frozen-lockfile
bun run check
bun run build
bun run start
```

Docker image 固定使用 `oven/bun:1.3.14`，並安裝 Noto CJK 字型以固定繁體中文分享卡排版。

## 指令

- `/career start mode:<dm|channel> name?:<1-10字> seed?:<1-24字>`
- `/career continue`
- `/career status`
- `/career history career?:<autocomplete>`
- `/career abandon`
- `/career share`
- `/career delete-data`
- `/career about`

全域 slash command 不會在 Bot 啟動時重複註冊。開發時可設定 `DISCORD_GUILD_ID` 以快速部署到單一測試伺服器；正式環境移除該值後再執行 `bun run discord:deploy`。

## 品質檢查

```bash
bun run typecheck
bun run lint
bun test
bun run test:integration
bun run test:simulation
bun run build
bun run db:verify
```

`bun run test:simulation` 預設模擬 10,000 組 seed，檢查死循環、非有限數值與互動次數上限。未提供 `TEST_DATABASE_URL` 時，Supabase live smoke test 會明確跳過；這不等於已驗證遠端 Supabase 或真人 Discord 流程。

## 資料與安全界線

- Discord User ID 是玩家識別，不使用 Supabase Auth。
- `custom_id` 只帶 career ID、revision 與 action key；遊戲狀態一律從 repository 讀回。
- action transaction 使用 row lock、revision check 與唯一 interaction ID。
- 結構化生涯日誌與 action、state 在同一個 transaction 寫入。
- `yakyulife` 是不列入 Data API 的私有 schema，`anon`／`authenticated` 無權存取。
- runtime role 只有遊戲資料 DML 權限；migration 才能執行 DDL。
- secrets 只放部署環境，不提交 `.env`。
- 完成與進行中的生涯長期保存；放棄且 30 天未更新的生涯由 Supabase Cron 分批清除。

`CAREER_ENGINE_VERSION` 控制新建立生涯使用的版本，可設為 `0.1.0`、`0.2.0` 或 `0.3.0`。既有生涯一律依自身 engine 版本繼續，不會在中途被轉換。

部署方式請見 `docs/DEPLOYMENT.md`，上游同步紀錄請見 `docs/UPSTREAM_SYNC.md`。
