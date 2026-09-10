import fs from "fs";

interface Phase5Event {
  tokenSymbol: string;
  tokenAddress: string;
  t0_index: number;
  t0_time: number;
  priceT0: number;
  marketCapT0: number;
  liquidityT0: number;
  holderCountT0: number;
  top10RateT0: number;
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  prev15mChange: number;
  candle1mChange: number;
  candle5mChange: number;
  buyUsdT0: number;
  sellUsdT0: number;
  buyerRatioT0: number;
  dropPercent: number;
  dropCandleVolume: number;
  volToLiq: number;
  hasSmartMoney: number;
  hasKOL: number;
  currentBotDecision: "BUY" | "PASS";
  botVerdict: string;
  botScore: number;
  botReason: string;
  next1mDirection: string;
  next1mChange: number;
  next1mBuyUsd: number;
  next1mSellUsd: number;
  next1mLowBroken: boolean;
  next2mDirection: string;
  next2mChange: number;
  next2mBuyUsd: number;
  next2mSellUsd: number;
  next2mLowBroken: boolean;
  bothGreen: boolean;
  bothRed: boolean;
  lowHeldBoth: boolean;
  price5m: number;
  price15m: number;
  return5m: number;
  return15m: number;
  max15: number;
  min15: number;
  recovered15m: boolean;
  collapsed15m: boolean;
  researchClassification: string;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(n: number, d: number): string {
  if (d === 0) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function runABTest() {
  console.log("=== PHASE 6: CONTROLLED A/B TEST (MODEL A vs B1 vs B2) ===");
  const rawData = fs.readFileSync("./phase5_live_data.json", "utf8");
  const dataset = JSON.parse(rawData);
  const events: Phase5Event[] = dataset.events;

  console.log(`Loaded ${events.length} events from 29 Robinhood Chain tokens.`);

  // --- MODEL SIMULATION ---
  // Model A: Existing Bot (TradingEngine / AnalysisEngine rules)
  // Model B1: Phase 5 Research Model (T0-Only, No Forward Knowledge)
  // Model B2: Phase 5 Research Model (Delayed Confirmation +1m/+2m, Entry at P_T+2m)

  const simulatedTrades: any[] = [];

  for (const e of events) {
    // 1. Model A Decision (Existing Bot)
    const modelADecision = e.currentBotDecision; // BUY or PASS
    const pT0 = e.priceT0;
    const pT15 = e.price15m;
    const retT0to15 = ((pT15 - pT0) / pT0) * 100;

    // 2. Model B1 Decision (T0 Only)
    // Frozen Phase 3/4/5 criteria at T0:
    // - Healthy base: Prev15m < 50%
    // - Volume check: Vol/Liq < 80%
    // - Security: Top10 < 25%, Liq >= 300, no honeypot, tax <= 10%
    // - Event: Dip event (<= -2.5%) or Breakout (>= 5.0%)
    const isDipOrBreakout = e.candle1mChange <= -2.5 || e.candle1mChange >= 5.0;
    const isB1Eligible =
      e.prev15mChange < 50 &&
      e.volToLiq < 80 &&
      e.top10RateT0 < 25 &&
      e.liquidityT0 >= 300 &&
      !e.isHoneypot &&
      e.buyTax <= 0.10 &&
      e.sellTax <= 0.10 &&
      isDipOrBreakout;

    const modelB1Decision = isB1Eligible ? "BUY" : "PASS";

    // 3. Model B2 Decision (Delayed Confirmation at T+2m)
    // Candidate if eligible at T0, BUT only buys if T+1m and T+2m are BOTH green and low was held.
    // Real entry price is P_T+2m, NOT P_T0!
    let modelB2Decision = "PASS";
    let pT2 = pT0;
    let retB2to15 = 0;
    let maxB2 = 0;
    let minB2 = 0;

    // Calculate exact P_T+2m
    const p1 = pT0 * (1 + e.next1mChange / 100);
    pT2 = p1 * (1 + e.next2mChange / 100);

    if (isB1Eligible) {
      if (e.bothGreen && e.lowHeldBoth) {
        modelB2Decision = "BUY";
        // Return from P_T+2m to P_T15m
        retB2to15 = ((pT15 - pT2) / pT2) * 100;
        // Adjusted max gain and drawdown from entry P_T+2m
        // If pT2 is higher than pT0, max gain from pT2 is adjusted
        const maxPriceForward = pT0 * (1 + e.max15 / 100);
        const minPriceForward = pT0 * (1 + e.min15 / 100);
        maxB2 = ((maxPriceForward - pT2) / pT2) * 100;
        minB2 = ((minPriceForward - pT2) / pT2) * 100;
      }
    }

    simulatedTrades.push({
      tokenSymbol: e.tokenSymbol,
      tokenAddress: e.tokenAddress,
      t0_time: e.t0_time,
      priceT0: pT0,
      priceT2: pT2,
      priceT15: pT15,
      prev15mChange: e.prev15mChange,
      volToLiq: e.volToLiq,
      candle1mChange: e.candle1mChange,
      // Decisions
      modelADecision,
      modelB1Decision,
      modelB2Decision,
      // Returns
      retT0to15,
      retB2to15,
      maxT0: e.max15,
      minT0: e.min15,
      maxB2,
      minB2,
      recoveredT0: e.recovered15m,
      collapsedT0: e.collapsed15m,
      recoveredB2: maxB2 >= 15.0,
      collapsedB2: minB2 <= -35.0 || retB2to15 <= -35.0,
      // Verification
      bothGreen: e.bothGreen,
      lowHeldBoth: e.lowHeldBoth,
      researchClassification: e.researchClassification
    });
  }

  // --- EVENT-LEVEL STATS ---
  function computeModelStats(modelName: "Model A" | "Model B1" | "Model B2") {
    let buys = 0;
    let passes = 0;
    const pnlList: number[] = [];
    const maxGainList: number[] = [];
    const maxDrawdownList: number[] = [];
    let recoveredCount = 0;
    let collapsedCount = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const t of simulatedTrades) {
      const dec = modelName === "Model A"
        ? t.modelADecision
        : (modelName === "Model B1" ? t.modelB1Decision : t.modelB2Decision);

      if (dec === "BUY") {
        buys++;
        const pnl = modelName === "Model B2" ? t.retB2to15 : t.retT0to15;
        const maxG = modelName === "Model B2" ? t.maxB2 : t.maxT0;
        const maxD = modelName === "Model B2" ? t.minB2 : t.minT0;
        const rec = modelName === "Model B2" ? t.recoveredB2 : t.recoveredT0;
        const col = modelName === "Model B2" ? t.collapsedB2 : t.collapsedT0;

        pnlList.push(pnl);
        maxGainList.push(maxG);
        maxDrawdownList.push(maxD);
        if (rec) recoveredCount++;
        if (col) collapsedCount++;
        if (pnl > 0) winCount++;
        else if (pnl < 0) lossCount++;
      } else {
        passes++;
      }
    }

    const totalDecisions = buys + passes;
    const totalPnl = pnlList.reduce((a, b) => a + b, 0) / 100; // $1 per trade in USDT
    const winRate = pct(winCount, buys);
    const recoveryRate = pct(recoveredCount, buys);
    const collapseRate = pct(collapsedCount, buys);
    const meanPnl = mean(pnlList).toFixed(2);
    const medPnl = median(pnlList).toFixed(2);
    const meanMaxGain = mean(maxGainList).toFixed(1);
    const meanDrawdown = mean(maxDrawdownList).toFixed(1);
    const worstDrawdown = maxDrawdownList.length > 0 ? Math.min(...maxDrawdownList).toFixed(1) : "0.0";
    const winLossRatio = lossCount > 0 ? (winCount / lossCount).toFixed(2) : (winCount > 0 ? "INF" : "0.00");

    return {
      modelName,
      totalDecisions,
      buys,
      passes,
      buyRatio: pct(buys, totalDecisions),
      winCount,
      lossCount,
      winRate,
      recoveredCount,
      recoveryRate,
      collapsedCount,
      collapseRate,
      totalPaperPnlUsd: totalPnl.toFixed(2),
      meanPnlPercent: `${meanPnl}%`,
      medianPnlPercent: `${medPnl}%`,
      meanMaxGainPercent: `+${meanMaxGain}%`,
      meanDrawdownPercent: `${meanDrawdown}%`,
      worstDrawdownPercent: `${worstDrawdown}%`,
      winLossRatio
    };
  }

  const statsA = computeModelStats("Model A");
  const statsB1 = computeModelStats("Model B1");
  const statsB2 = computeModelStats("Model B2");

  // --- TOKEN-LEVEL AGGREGATION ---
  // Avoid intra-token clustering / double counting
  const tokenMap = new Map<string, typeof simulatedTrades>();
  for (const t of simulatedTrades) {
    const list = tokenMap.get(t.tokenAddress) || [];
    list.push(t);
    tokenMap.set(t.tokenAddress, list);
  }

  function computeTokenLevelStats(modelName: "Model A" | "Model B1" | "Model B2") {
    let tokensTraded = 0;
    let tokensPassed = 0;
    const tokenAvgPnls: number[] = [];
    let profitableTokens = 0;
    let unprofitableTokens = 0;

    for (const [addr, evts] of tokenMap.entries()) {
      const modelBuys = evts.filter(e => {
        return modelName === "Model A"
          ? e.modelADecision === "BUY"
          : (modelName === "Model B1" ? e.modelB1Decision === "BUY" : e.modelB2Decision === "BUY");
      });

      if (modelBuys.length > 0) {
        tokensTraded++;
        const pnls = modelBuys.map(b => modelName === "Model B2" ? b.retB2to15 : b.retT0to15);
        const avgTokenPnl = mean(pnls);
        tokenAvgPnls.push(avgTokenPnl);
        if (avgTokenPnl > 0) profitableTokens++;
        else unprofitableTokens++;
      } else {
        tokensPassed++;
      }
    }

    return {
      totalTokens: tokenMap.size,
      tokensTraded,
      tokensPassed,
      profitableTokens,
      unprofitableTokens,
      tokenWinRate: pct(profitableTokens, tokensTraded),
      meanTokenPnl: `${mean(tokenAvgPnls).toFixed(2)}%`,
      medianTokenPnl: `${median(tokenAvgPnls).toFixed(2)}%`
    };
  }

  const tokenStatsA = computeTokenLevelStats("Model A");
  const tokenStatsB1 = computeTokenLevelStats("Model B1");
  const tokenStatsB2 = computeTokenLevelStats("Model B2");

  // --- OPPORTUNITY COST & MISSED RUNNERS / AVOIDED LOSSES ---
  // Missed Runner: Model A or B2 PASS, but token does +30% or more
  // Avoided Collapse: Model A or B1 BUY, but token collapses -35% or more
  let b2AvoidedCollapses = 0;
  let b2MissedRunners = 0;
  let b1AvoidedCollapses = 0;
  let b1MissedRunners = 0;

  for (const t of simulatedTrades) {
    const isRunner = t.maxT0 >= 30.0;
    const isCollapse = t.collapsedT0;

    // Model B2 avoided collapses vs B1
    if (t.modelB1Decision === "BUY" && t.modelB2Decision === "PASS" && isCollapse) {
      b2AvoidedCollapses++;
    }
    // Model B2 missed runners vs B1
    if (t.modelB1Decision === "BUY" && t.modelB2Decision === "PASS" && isRunner) {
      b2MissedRunners++;
    }

    // Model B1 missed runners vs total market
    if (t.modelB1Decision === "PASS" && isRunner) {
      b1MissedRunners++;
    }
    // Model B1 avoided collapses vs total market
    if (t.modelB1Decision === "PASS" && isCollapse) {
      b1AvoidedCollapses++;
    }
  }

  // Confirmation Drag (cost of waiting for 2 green candles in B2 vs B1 when both bought)
  const mutualBuys = simulatedTrades.filter(t => t.modelB1Decision === "BUY" && t.modelB2Decision === "BUY");
  const confirmationDrags = mutualBuys.map(t => ((t.priceT2 - t.priceT0) / t.priceT0) * 100);
  const avgConfirmationDrag = mean(confirmationDrags).toFixed(2);

  // --- NEGATIVE CONTROLS AUDIT ---
  // 1. Double green but collapsed (False Green)
  const doubleGreenCollapses = simulatedTrades.filter(t => t.bothGreen && t.collapsedT0);
  // 2. Low Prev15m (< 50%) but collapsed
  const lowPrev15Collapses = simulatedTrades.filter(t => t.prev15mChange < 50 && t.collapsedT0);
  // 3. Low Vol/Liq (< 40%) but collapsed
  const lowVolLiqCollapses = simulatedTrades.filter(t => t.volToLiq < 40 && t.collapsedT0);
  // 4. High Prev15m (>= 80%) but strong runner (>= 50% max gain)
  const highPrev15Runners = simulatedTrades.filter(t => t.prev15mChange >= 80 && t.maxT0 >= 50);
  // 5. Model B2 wrong entries (B2 bought but lost)
  const b2LosingTrades = simulatedTrades.filter(t => t.modelB2Decision === "BUY" && t.retB2to15 < 0);

  const negativeControls = {
    doubleGreenCollapsesCount: doubleGreenCollapses.length,
    doubleGreenCollapsesRate: pct(doubleGreenCollapses.length, simulatedTrades.filter(t => t.bothGreen).length),
    lowPrev15CollapsesCount: lowPrev15Collapses.length,
    lowPrev15CollapsesRate: pct(lowPrev15Collapses.length, simulatedTrades.filter(t => t.prev15mChange < 50).length),
    lowVolLiqCollapsesCount: lowVolLiqCollapses.length,
    lowVolLiqCollapsesRate: pct(lowVolLiqCollapses.length, simulatedTrades.filter(t => t.volToLiq < 40).length),
    highPrev15RunnersCount: highPrev15Runners.length,
    highPrev15RunnersRate: pct(highPrev15Runners.length, simulatedTrades.filter(t => t.prev15mChange >= 80).length),
    b2LosingTradesCount: b2LosingTrades.length,
    b2TotalBuys: statsB2.buys,
    sampleB2Loss: b2LosingTrades[0] ? {
      token: `${b2LosingTrades[0].tokenSymbol} (${b2LosingTrades[0].tokenAddress.slice(0, 8)}...)`,
      pT0: b2LosingTrades[0].priceT0,
      pT2: b2LosingTrades[0].priceT2,
      retB2: `${b2LosingTrades[0].retB2to15.toFixed(1)}%`,
      minB2: `${b2LosingTrades[0].minB2.toFixed(1)}%`
    } : null
  };

  const results = {
    totalEvents: events.length,
    totalTokens: dataset.tokensAnalyzed,
    eventLevelStats: {
      modelA: statsA,
      modelB1: statsB1,
      modelB2: statsB2
    },
    tokenLevelStats: {
      modelA: tokenStatsA,
      modelB1: tokenStatsB1,
      modelB2: tokenStatsB2
    },
    opportunityMetrics: {
      b2AvoidedCollapsesVsB1: b2AvoidedCollapses,
      b2MissedRunnersVsB1: b2MissedRunners,
      b1AvoidedCollapsesVsMarket: b1AvoidedCollapses,
      b1MissedRunnersVsMarket: b1MissedRunners,
      avgConfirmationDragPercent: `${avgConfirmationDrag}%`,
      mutualBuysCount: mutualBuys.length
    },
    negativeControls
  };

  fs.writeFileSync("./phase6_ab_results.json", JSON.stringify(results, null, 2));
  console.log("Phase 6 A/B Test Completed! Saved to phase6_ab_results.json");
  console.log("\n--- Event-Level Results ---");
  console.table([statsA, statsB1, statsB2]);
  console.log("\n--- Token-Level Results ---");
  console.table([tokenStatsA, tokenStatsB1, tokenStatsB2]);
  console.log("\n--- Opportunity & Trade-off Metrics ---");
  console.log(results.opportunityMetrics);
  console.log("\n--- Negative Controls ---");
  console.log(results.negativeControls);
}

runABTest().catch(err => {
  console.error("A/B test execution error:", err);
  process.exit(1);
});
