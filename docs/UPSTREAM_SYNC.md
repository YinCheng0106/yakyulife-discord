# YaKyuLife 上游同步紀錄

## 第一版基準

- 上游：[LeoGGcat/yakyulife](https://github.com/LeoGGcat/yakyulife)
- SHA：`913cad27db86bda79cbd53dc5666ab15d28c5d2d`
- 授權：CC BY-NC 4.0
- 舊版相容 engine：`0.1.0`
- 新投手 engine：`0.2.0`／`0.3.0`
- 檢視日期：2026-08-12

## MVP 移植範圍

保留投手四能力、高中／大學重投選秀、中職二軍／一軍、先發／中繼／終結者、訓練、年度事件、傷病、TJ、合約、FA、衰退、引退，以及天才、玻璃人、鐵人、大器晚成、自律狂、大心臟、橡膠手臂等概念。

Discord MVP 不是網頁版逐行移植。為將一次完整生涯控制在約 60 次互動內，事件數、觸發門檻、機率、球隊、薪資與球季統計均採縮減／重新平衡版本；日職、美職、國際賽、野手、感情線、排行榜與其他隱藏特性未移植。原作 UI、存檔格式及 JavaScript 全域狀態也未沿用。

## 投手 engine 0.2.0／0.3.0

- `0.2.0`：逐顆訓練骰指派、復原與確認、結構化事件及逐年 Discord 生涯紀錄。
- `0.3.0`：投手海外路線、韓職、澳職短期／長期效力、國際賽及感情家庭狀態。
- 健康且至少打到 30 歲的新版投手生涯，以約 100～160 次主要操作為平衡目標。
- 韓國與澳洲球隊均為「地名＋自創名稱」的架空球隊，不使用真實球團商標。
- 野手、捕手與跨玩家排行榜仍未移植。
- `0.1.0` state 與 golden fixture 保持不變；新版不會靜默改寫既有生涯。

## 同步程序

1. 執行 `bun run upstream:check`，只取得最新 SHA 與 commit message。
2. 人工閱讀上游 CHANGELOG、WIKI 與相關程式碼。
3. 在本文件新增一筆差異紀錄，決定要移植、延後或拒絕。
4. 更新 declarative rule tables、`ENGINE_VERSION` 及需要的 state migration。
5. 新增／更新 golden fixtures，跑 `bun run check` 與 10,000 組模擬。
6. 只讓新 career 使用新 engine；舊 career 明確 migration，不能靜默換規則。

`upstream:check` 永遠不得自動合併或覆蓋本地平衡。
