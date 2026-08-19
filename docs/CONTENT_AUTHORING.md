# Content Pack 撰寫與審核

正式遊戲內容位於 `packages/content/content/v0.5/`，以 JSON 發布並在載入時由 Zod 驗證。請勿直接加入 JavaScript、公式字串、資料庫欄位或未定義的效果類型。

## 提案方式

使用 GitHub 的 Content proposal 表單。真實事件靈感可來自任何公開可查證來源，不限官方報導；請附來源網址。原創內容可不附來源，但必須清楚標為架空。兩種提案都不得把未核實內容寫成真實新聞，也不得使用真人、真實隊名、隊徽或新聞原文。

維護者會將核准提案改寫為架空事件，限制在已支援的效果白名單，並在發布前執行 schema、測試與大量 seed 模擬。

## 發布規則

- 每次內容改動都提升 Content Pack 版本並更新 changelog。
- 新 career 固定 `contentPackVersion` 與 `contentHash`；不得修改既有 career 的內容版本。
- 需要新遊戲機制的提案，先開獨立 issue；Content Pack 不能自行新增可執行邏輯。
- 架空 MLB 隊名發布前，維護者須做名稱與商標風險人工檢查。
