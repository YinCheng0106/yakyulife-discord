import { describe, expect, test } from "bun:test";
import { CONTENT_PACK_HASH, CONTENT_PACK_VERSION } from "@yakyulife/content";
import {
  CAREER_EVENTS,
  createCareerState,
  ENGINE_VERSION,
  FOUR_POSITION_ENGINE_VERSION,
  type GameAction,
  keyedRandom,
  LEAGUE_RULES,
  LEGACY_ENGINE_VERSION,
  LEVEL_LABELS,
  positionThreshold,
  reduceCareer,
} from "@yakyulife/core";
import golden from "../../packages/core/test-fixtures/golden-v1.json" with { type: "json" };
import { assertFiniteTree, runCareer } from "../helpers/simulation.ts";

describe("career engine", () => {
  test("same seed and action produce exactly the same result", () => {
    const left = createCareerState("測試投手", "golden-seed");
    const right = createCareerState("測試投手", "golden-seed");
    expect(left).toEqual(right);
    const action = { type: "assign_training_die", ability: "velocity" } as const;
    expect(reduceCareer(left, action)).toEqual(reduceCareer(right, action));
  });

  test("pins the v0.5 content pack while preserving v0.4 state shape", () => {
    const current = createCareerState("內容投手", "content-pin");
    const v04 = createCareerState("舊版投手", "v04-pin", FOUR_POSITION_ENGINE_VERSION);
    expect(current.engineVersion).toBe(ENGINE_VERSION);
    expect(current.contentPackVersion).toBe(CONTENT_PACK_VERSION);
    expect(current.contentHash).toBe(CONTENT_PACK_HASH);
    expect(v04.contentPackVersion).toBeUndefined();
    expect(v04.contentHash).toBeUndefined();
  });

  test("matches the versioned golden fixture", () => {
    let state = createCareerState("黃金投手", golden.seed, LEGACY_ENGINE_VERSION);
    for (const action of golden.actions as GameAction[]) state = reduceCareer(state, action).state;
    const digest = new Bun.CryptoHasher("sha256").update(JSON.stringify(state)).digest("hex");
    expect(state.engineVersion).toBe(golden.engineVersion);
    expect(digest).toBe(golden.stateSha256);
  });

  test("reducer does not mutate its input", () => {
    const state = createCareerState("純函式", "immutable");
    const snapshot = structuredClone(state);
    reduceCareer(state, { type: "assign_training_die", ability: "velocity" });
    expect(state).toEqual(snapshot);
  });

  test("rejects an invalid training allocation", () => {
    const state = createCareerState("錯誤測試", "invalid", LEGACY_ENGINE_VERSION);
    expect(() =>
      reduceCareer(state, {
        type: "allocate_training",
        primary: "velocity",
        secondary: "velocity",
      }),
    ).toThrow("不可相同");
  });

  test("assigns dice independently, supports undo, and applies only on confirmation", () => {
    let state = createCareerState("逐骰投手", "per-die");
    const initialAbilities = structuredClone(state.abilities);
    const dice = state.pending?.type === "training" ? [...state.pending.dice] : [];
    expect(dice.length).toBeGreaterThanOrEqual(3);

    state = reduceCareer(state, { type: "assign_training_die", ability: "control" }).state;
    expect(state.abilities).toEqual(initialAbilities);
    expect(state.pending?.type === "training" ? state.pending.assignments : []).toEqual([
      "control",
    ]);

    state = reduceCareer(state, { type: "undo_training_die" }).state;
    expect(state.pending?.type === "training" ? state.pending.assignments : []).toEqual([]);
    for (let index = 0; index < dice.length; index += 1)
      state = reduceCareer(state, { type: "assign_training_die", ability: "control" }).state;
    const confirmed = reduceCareer(state, { type: "confirm_training" });
    expect(confirmed.state.abilities.control ?? 0).toBeGreaterThan(initialAbilities.control ?? 0);
    expect(confirmed.state.pending?.type).toBe("event");
    expect(confirmed.events.some((event) => event.category === "training")).toBe(true);
  });

  test("does not persist temporary training allocations as annual events", () => {
    const state = createCareerState("暫存測試", "temporary-training");
    const assigned = reduceCareer(state, { type: "assign_training_die", ability: "control" });
    expect(assigned.state.lastOutcome.some((message) => message.includes("訓練骰暫存"))).toBe(true);
    expect(assigned.events).toEqual([]);

    const undone = reduceCareer(assigned.state, { type: "undo_training_die" });
    expect(undone.events).toEqual([]);
  });

  test("defines the complete American minor-league ladder", () => {
    const levels = ["rookie", "a", "high_a", "aa", "aaa"] as const;
    expect(levels.map((level) => LEVEL_LABELS[level])).toEqual([
      "美職新人聯盟",
      "小聯盟 1A",
      "高階 1A",
      "小聯盟 2A",
      "小聯盟 3A",
    ]);
    expect(LEAGUE_RULES.rookie.promotionOverall).toBeLessThan(
      LEAGUE_RULES.aaa.promotionOverall ?? Number.POSITIVE_INFINITY,
    );
    expect(LEAGUE_RULES.aaa.demotionOverall).toBe(48);
  });

  test("records Australian offseason appearances without advancing age", () => {
    const state = createCareerState("澳職投手", "abl-offseason");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.contract.yearsRemaining = 2;
    state.pending = { type: "abl", team: "雪梨灣鯊", mode: "offseason" };
    const age = state.age;
    const result = reduceCareer(state, { type: "choose_abl", choice: "accept" });
    const appearance = result.state.seasons.find((season) => season.engagement === "offseason");
    expect(appearance?.league).toBe("abl");
    expect(appearance?.team).toBe("雪梨灣鯊");
    expect(result.state.age).toBe(age + 1);
    expect(appearance?.age).toBe(age);
  });

  test("persists relationship choices and their consequences", () => {
    const state = createCareerState("人生投手", "life-event");
    state.stage = "professional";
    state.pending = { type: "life", eventId: "dating" };
    const result = reduceCareer(state, { type: "choose_life", choice: "accept" });
    expect(result.state.life?.status).toBe("dating");
    expect(result.state.life?.partner).not.toBeNull();
    expect(result.events.some((event) => event.category === "life")).toBe(true);
  });

  test("supports a full Korean league contract destination", () => {
    const state = createCareerState("韓職投手", "kbo-contract");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.pending = {
      type: "contract",
      offers: [
        {
          id: "overseas",
          kind: "overseas",
          years: 3,
          salary: 2_400,
          level: "kbo1",
          team: "首爾彗星",
        },
      ],
    };
    const result = reduceCareer(state, { type: "choose_contract", choice: "overseas" });
    expect(result.state.level).toBe("kbo1");
    expect(result.state.team).toBe("首爾彗星");
    expect(result.state.contract.yearsRemaining).toBe(3);
  });

  test("labels a contract from an overseas league back to CPBL as a return contract", () => {
    const state = createCareerState("返台投手", "return-contract");
    state.stage = "professional";
    state.level = "npb1";
    state.team = "東京白鷺";
    state.pending = {
      type: "contract",
      offers: [
        {
          id: "overseas",
          kind: "overseas",
          years: 2,
          salary: 1_200,
          level: "cpbl1",
          team: "台中猛瑪",
          source: "fa",
        },
      ],
    };
    const result = reduceCareer(state, { type: "choose_contract", choice: "overseas" });
    expect(result.events.some((event) => event.body.includes("返台合約"))).toBe(true);
    expect(result.events.some((event) => event.body.includes("海外合約"))).toBe(false);
  });

  test("records international appearances separately from the primary league", () => {
    const state = createCareerState("國手投手", "international");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.contract.yearsRemaining = 2;
    state.pending = {
      type: "international",
      tournament: "世界棒球經典賽",
      forced: false,
    };
    const result = reduceCareer(state, { type: "choose_international", choice: "accept" });
    const appearance = result.state.seasons.find((season) => season.league === "international");
    expect(appearance?.team).toBe("中華隊");
    expect(appearance?.engagement).toBe("offseason");
    expect(appearance?.games).toBeGreaterThanOrEqual(1);
    expect(appearance?.games).toBeLessThanOrEqual(2);
    expect(appearance && "innings" in appearance ? appearance.innings : 0).toBeLessThanOrEqual(14);
    expect(["cpbl1", "cpbl2"]).toContain(result.state.level);

    const reliever = createCareerState("國手後援", "international-reliever");
    Object.assign(reliever, {
      stage: "professional",
      level: "cpbl1",
      team: "台中猛瑪",
      role: "reliever",
      pending: { type: "international", tournament: "世界12強賽", forced: true },
    });
    const reliefResult = reduceCareer(reliever, {
      type: "choose_international",
      choice: "accept",
    }).state.seasons.find((season) => season.league === "international");
    expect(reliefResult?.games).toBeGreaterThanOrEqual(3);
    expect(reliefResult?.games).toBeLessThanOrEqual(6);
    expect(reliefResult && "starts" in reliefResult ? reliefResult.starts : -1).toBe(0);

    const hitter = createCareerState("國手外野", "international-hitter", undefined, "outfielder");
    Object.assign(hitter, {
      stage: "professional",
      level: "cpbl1",
      team: "台中猛瑪",
      pending: { type: "international", tournament: "世界棒球經典賽", forced: true },
    });
    const hitterResult = reduceCareer(hitter, {
      type: "choose_international",
      choice: "accept",
    }).state.seasons.find((season) => season.league === "international");
    expect(hitterResult?.games).toBeGreaterThanOrEqual(5);
    expect(hitterResult?.games).toBeLessThanOrEqual(8);
  });

  test("provides all four playable position groups and valid hitter seasons", () => {
    for (const position of ["pitcher", "catcher", "infielder", "outfielder"] as const) {
      const initial = createCareerState(
        `測試${position}`,
        `position-${position}`,
        undefined,
        position,
      );
      expect(initial.positionGroup).toBe(position);
      const completed = runCareer(initial, 300).state;
      assertFiniteTree(completed);
      expect(completed.summary?.positionGroup).toBe(position);
      for (const season of completed.seasons) {
        if (season.kind !== "hitter") continue;
        expect(season.hits).toBeLessThanOrEqual(season.atBats);
        expect(season.homeRuns).toBeLessThanOrEqual(season.hits);
        expect(season.atBats).toBeLessThanOrEqual(season.plateAppearances);
        expect(season.games).toBeLessThanOrEqual(LEAGUE_RULES[season.level].games);
      }
    }
  });

  test("ships the 17 upstream-inspired events plus six fictionalized additions", () => {
    expect(CAREER_EVENTS).toHaveLength(23);
    expect(CAREER_EVENTS.slice(0, 17).map((event) => event.title)).toEqual([
      "打擊機特訓",
      "重量訓練週期",
      "牛棚加練",
      "長傳接訓練",
      "影像分析課",
      "跑壘特訓",
      "守備千球練習",
      "觸身球驚魂",
      "媒體專訪",
      "教練團關注",
      "伙食與睡眠計畫",
      "學長／老將指點",
      "球速測定日",
      "配球讀書會",
      "宵夜文化",
      "場外代言邀約",
      "季中低潮",
    ]);
    expect(
      CAREER_EVENTS.find((event) => event.id === "catcher_collision")?.eligiblePositions,
    ).toEqual(["catcher"]);
    expect(
      CAREER_EVENTS.find((event) => event.id === "family_tournament_conflict")?.sourceNote,
    ).toContain("WBSC");
    expect(
      CAREER_EVENTS.find((event) => event.id === "family_tournament_conflict")?.choiceLabels,
    ).toEqual(["🏠 家庭還是比較重要", "⚾ 棒球還是比較重要"]);
    expect(CAREER_EVENTS.some((event) => event.id === "position_role_meeting")).toBe(true);
    expect(CAREER_EVENTS.some((event) => event.id === "expansion_draft")).toBe(false);
  });

  test("keeps high-school years one and two and university year one out of the draft", () => {
    const highSchool = createCareerState("高中生", "scout-early-high");
    highSchool.pending = { type: "event", eventId: "video_room" };
    const highResult = reduceCareer(highSchool, { type: "choose_event", strategy: "normal" }).state;
    expect(highResult.stage).toBe("high_school");
    expect(highResult.stageYear).toBe(2);
    expect(highResult.pending?.type).toBe("training");

    const university = createCareerState("大一生", "scout-early-university");
    university.stage = "university";
    university.stageYear = 1;
    university.team = "北方大學";
    university.pending = { type: "event", eventId: "video_room" };
    const universityResult = reduceCareer(university, {
      type: "choose_event",
      strategy: "normal",
    }).state;
    expect(universityResult.stageYear).toBe(2);
    expect(universityResult.pending?.type).toBe("training");
  });

  test("scouting evaluates shown tools and performance without reading hidden potential", () => {
    const left = createCareerState("球探甲", "scouting-no-potential", undefined, "infielder");
    left.stage = "university";
    left.stageYear = 1;
    left.team = "北方大學";
    left.abilities = {
      stamina: 48,
      contact: 55,
      power: 42,
      speed: 47,
      eye: 46,
      range: 45,
      fielding: 50,
      arm: 44,
    };
    left.pending = { type: "event", eventId: "video_room" };
    const right = structuredClone(left);
    for (const key of Object.keys(left.potential) as Array<keyof typeof left.potential>) {
      left.potential[key] = 1;
      right.potential[key] = 80;
    }
    const leftResult = reduceCareer(left, { type: "choose_event", strategy: "normal" }).state;
    const rightResult = reduceCareer(right, { type: "choose_event", strategy: "normal" }).state;
    expect(leftResult.scouting).toEqual(rightResult.scouting);
    expect(leftResult.scouting?.reports.at(-1)?.summary).toContain("優勢是擊球");
  });

  test("tryout never counts as an undrafted attempt and CPBL direct signing needs three", () => {
    const state = createCareerState("測試會球員", "tryout-attempts");
    if (!state.scouting) throw new Error("missing scouting state");
    state.scouting.markets.cpbl.internalRating = 32;
    state.pending = {
      type: "scout_opportunity",
      fallback: "continue_school",
      offers: [{ id: "tryout", kind: "cpbl_tryout", label: "參加新人測試會" }],
    };
    const result = reduceCareer(state, {
      type: "choose_scout_opportunity",
      choice: "tryout",
    }).state;
    expect(result.scouting?.draftAttempts).toBe(0);

    state.pending = {
      type: "scout_opportunity",
      fallback: "continue_school",
      offers: [
        {
          id: "recommendation",
          kind: "cpbl_recommendation",
          label: "接受高中教練推薦進入選秀",
        },
      ],
    };
    state.scouting.draftEligibility = "none";
    const recommended = reduceCareer(state, {
      type: "choose_scout_opportunity",
      choice: "recommendation",
    }).state;
    expect(recommended.scouting?.draftEligibility).toBe("coach_recommendation");
    expect(recommended.pending?.type).toBe("draft");

    state.pending = {
      type: "scout_opportunity",
      fallback: "continue_school",
      offers: [
        {
          id: "direct",
          kind: "cpbl_direct",
          label: "自由協商",
          team: "台中猛瑪",
          level: "cpbl2",
          salary: 84,
          years: 1,
        },
      ],
    };
    state.scouting.draftAttempts = 2;
    expect(() =>
      reduceCareer(state, { type: "choose_scout_opportunity", choice: "direct" }),
    ).toThrow("三次選秀落選");
    state.scouting.draftAttempts = 3;
    expect(
      reduceCareer(state, { type: "choose_scout_opportunity", choice: "direct" }).state.stage,
    ).toBe("professional");
  });

  test("an undrafted senior can enter amateur baseball and retires as a coach at 26", () => {
    let undrafted: ReturnType<typeof createCareerState> | null = null;
    for (let index = 0; index < 100 && !undrafted; index += 1) {
      const candidate = createCareerState(`大四${index}`, `undrafted-${index}`);
      if (!candidate.scouting) throw new Error("missing scouting state");
      candidate.stage = "university";
      candidate.stageYear = 4;
      candidate.age = 21;
      candidate.team = "北方大學";
      for (const key of Object.keys(candidate.abilities) as Array<keyof typeof candidate.abilities>)
        candidate.abilities[key] = 1;
      candidate.scouting.draftEligibility = "club_recommendation";
      candidate.scouting.markets.cpbl.internalRating = 1;
      candidate.pending = {
        type: "draft",
        canEnterDraft: true,
        canContinueSchool: false,
        canJoinAmateur: true,
        canRetire: true,
        schoolLabel: null,
      };
      const result = reduceCareer(candidate, { type: "choose_draft", choice: "draft" }).state;
      if (result.stage === "amateur_club") undrafted = result;
    }
    expect(undrafted?.scouting?.draftAttempts).toBe(1);

    if (!undrafted) throw new Error("expected an undrafted route");
    undrafted.age = 26;
    undrafted.pending = { type: "event", eventId: "video_room" };
    const retired = reduceCareer(undrafted, { type: "choose_event", strategy: "normal" }).state;
    expect(retired.stage).toBe("retired");
    expect(retired.summary?.ending).toContain("基層教練");
  });

  test("uses persisted multi-stage FA decisions and discounted home returns", () => {
    const state = createCareerState("FA 測試", "fa-flow");
    state.stage = "professional";
    state.level = "cpbl1";
    state.team = "台中猛瑪";
    state.contract.topLevelServiceYears = 5;
    state.contract.clubControlled = true;
    state.abilities = { stamina: 65, velocity: 65, control: 65, breaking: 65 };
    state.pending = { type: "free_agency_decision", homeBaseSalary: 1_000 };
    const market = reduceCareer(state, { type: "choose_free_agency", choice: "market" }).state;
    expect(market.pending?.type).toBe("free_agent_market");
    if (market.pending?.type !== "free_agent_market") throw new Error("market not created");
    expect(market.pending.returnMultiplier).toBe(0.9);
    const returned = reduceCareer(market, { type: "choose_free_agency", choice: "home" }).state;
    expect(returned.contract.annualSalary).toBe(900);
    expect(returned.contract.yearsRemaining).toBe(1);

    const cold = createCareerState("冷市場", "fa-cold", undefined, "infielder");
    cold.stage = "professional";
    cold.level = "mlb";
    cold.team = "紐約自由鳥";
    for (const key of Object.keys(cold.abilities))
      cold.abilities[key as keyof typeof cold.abilities] = 1;
    cold.pending = { type: "free_agency_decision", homeBaseSalary: 1_000 };
    const noOffers = reduceCareer(cold, { type: "choose_free_agency", choice: "market" }).state;
    expect(
      noOffers.pending?.type === "free_agent_market" ? noOffers.pending.offers : [],
    ).toHaveLength(0);
    expect(
      noOffers.pending?.type === "free_agent_market" ? noOffers.pending.returnMultiplier : 0,
    ).toBe(0.7);
  });

  test("keeps keyed world draws isolated from choice draws", () => {
    const args = ["duel-seed", "0.4.0", "salary-duel-v1", "pitcher", 2032] as const;
    const before = keyedRandom(...args, "world", "league", "market-index", 0);
    keyedRandom(...args, "choiceOutcome", "event", "bold-result", 0);
    const after = keyedRandom(...args, "world", "league", "market-index", 0);
    expect(after).toBe(before);
  });

  test("uses original top-level position thresholds and derived KBO values", () => {
    expect(positionThreshold("cpbl1", "SS", 26)).toBe(50);
    expect(positionThreshold("npb1", "C", 22)).toBe(51);
    expect(positionThreshold("kbo1", "CF", 26)).toBe(55);
  });
});
