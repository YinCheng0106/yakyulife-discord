# 部署與 Supabase 設定

## 1. 建立 schema

建議先將本機專案連到 Supabase，再預覽及套用 migration：

```bash
bunx supabase login
bunx supabase link --project-ref <PROJECT_REF>
bun run db:push:dry-run
bun run db:push
bun run db:verify
```

`PROJECT_REF` 可從 Supabase Dashboard 專案網址 `/project/<PROJECT_REF>` 取得。`supabase link` 產生的 `supabase/.temp/` 已排除於 Git。

不使用 link 時，可在 `.env` 設定 percent-encoded、具 DDL 權限的 `MIGRATION_DATABASE_URL`。wrapper 會改用 CLI 的 `--db-url`；此值只供 migration 使用，不得拿 Bot runtime 的低權限 `DATABASE_URL` 代替。

Migration 會建立不由 Data API 暴露的 `yakyulife` schema、資料表、RLS policy 與 `yakyulife_runtime` 群組角色。`anon` 與 `authenticated` 不具存取權。

## 2. 建立專用登入角色

密碼不可寫入 migration 或 Git。請在 Supabase SQL Editor 以管理者身分執行下列範本，將密碼換成部署平台產生的高強度 secret：

```sql
create role yakyulife_bot_login login password 'REPLACE_WITH_DEPLOYMENT_SECRET' noinherit;
grant yakyulife_runtime to yakyulife_bot_login;
```

將該角色的 PostgreSQL 連線字串存為部署環境的 `DATABASE_URL`。Bot 每筆 repository 操作都在 transaction 內執行 `SET LOCAL ROLE yakyulife_runtime`；登入角色不應取得 schema ownership、DDL、`service_role` 或其他業務 schema 權限。管理用的 `MIGRATION_DATABASE_URL` 與 runtime `DATABASE_URL` 必須分開。

長時間執行的 Bun process：

- 部署環境有 IPv6：使用 direct connection。
- 只有 IPv4：使用 Supavisor session mode。
- 不使用 serverless transaction pooler。

可先執行 `bun run db:doctor`。若本機或部署環境無法連到只有 IPv6 的 direct endpoint，在已完成 `supabase link` 的開發環境可執行 `bun run db:use-session-pooler`。它會從 CLI 的 linked metadata 取得 session endpoint、保留既有密碼、加上 `sslmode=require`，並在不顯示秘密的情況下備份及更新 `.env`。

請參考 [Supabase 連線指南](https://supabase.com/docs/guides/database/connecting-to-postgres)。

## 3. Discord 與啟動

設定 `.env.example` 列出的環境變數，先用測試 guild 部署 slash command：

```bash
bun run discord:deploy
bun run check
bun run start
```

健康檢查為 `GET /health`。確認 staging 的 DM、頻道、重啟續玩、雙擊、舊按鈕、非擁有者、訊息刪除、Supabase 暫停與 PNG 中文字型後，才移除 `DISCORD_GUILD_ID` 部署 global command。

正式切換 command ownership 時，獨立 Bot 與 YINLA 不得同時部署 `/career`。
