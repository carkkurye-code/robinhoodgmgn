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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function runAnalysis() {
  const raw = fs.readFileSync("./phase5_live_data.json", "utf8");
  const data = JSON.parse(raw);
  const events: Phase5Event[] = data.events;

  console.log(`Analyzing ${events.length} live events across ${data.tokensAnalyzed} tokens...`);

  // 1. Group by Research Classification
  const classes = ["Hunter Signal", "Promising Signal", "Neutral", "False Hunter Signal", "Prey / Collapse"];
  const classStats: Record<string, any> = {};

  for (const c of classes) {
    const subset = events.filter(e => e.researchClassification === c);
    const recovered = subset.filter(e => e.recovered15m).length;
    const collapsed = subset.filter(e => e.collapsed15m).length;
    const maxGains = subset.map(e => e.max15);
    const maxDrawdowns = subset.map(e => e.min15);

    classStats[c] = {
      count: subset.length,
      share: pct(subset.length, events.length),
      recoveredCount: recovered,
      recoveryRate: pct(recovered, subset.length),
      collapsedCount: collapsed,
      collapseRate: pct(collapsed, subset.length),
      meanMaxGain: mean(maxGains).toFixed(1),
      medianMaxGain: median(maxGains).toFixed(1),
      meanDrawdown: mean(maxDrawdowns).toFixed(1),
      medianDrawdown: median(maxDrawdowns).toFixed(1)
    };
  }

  // 2. T0-only vs T0+1m vs T0+1m/+2m confirmation comparison
  // Focus on events with a drop (candleChangeT0 <= -2.5%)
  const dropEvents = events.filter(e => e.candle1mChange <= -2.5);

  // Strategy A: T0-only buy dip blindly
  const t0OnlyRec = dropEvents.filter(e => e.recovered15m).length;
  const t0OnlyCol = dropEvents.filter(e => e.collapsed15m).length;

  // Strategy B: T0 + 1m green confirmation
  const t1GreenEvents = dropEvents.filter(e => e.next1mDirection === "YEŞİL");
  const t1GreenRec = t1GreenEvents.filter(e => e.recovered15m).length;
  const t1GreenCol = t1GreenEvents.filter(e => e.collapsed15m).length;

  // Strategy C: T0 + 1m/+2m double green & low held
  const t2GreenEvents = dropEvents.filter(e => e.bothGreen && e.lowHeldBoth);
  const t2GreenRec = t2GreenEvents.filter(e => e.recovered15m).length;
  const t2GreenCol = t2GreenEvents.filter(e => e.collapsed15m).length;

  // Strategy D: T0 + Double Red (Prey behavior)
  const doubleRedEvents = dropEvents.filter(e => e.bothRed);
  const doubleRedCol = doubleRedEvents.filter(e => e.collapsed15m).length;
  const doubleRedRec = doubleRedEvents.filter(e => e.recovered15m).length;

  // 3. 9 Specific Questions Analysis
  // Q1: Büyük kırmızı mum tek başına SELL sinyali mi?
  // After a red candle, what % recover vs collapse?
  const q1RedCandles = events.filter(e => e.candle1mChange <= -3.0);
  const q1Recovered = q1RedCandles.filter(e => e.recovered15m).length;
  const q1Collapsed = q1RedCandles.filter(e => e.collapsed15m).length;
  const q1BounceAfter = q1RedCandles.filter(e => e.next1mDirection === "YEŞİL").length;

  // Q2: İlk 1-2 dakikadaki alıcı davranışı sonucu ayırıyor mu?
  // When +1m/+2m is green vs red, what is the divergence in recovery and collapse?
  const q2BothGreen = events.filter(e => e.bothGreen);
  const q2BothRed = events.filter(e => e.bothRed);

  // Q3: Prev15m aşırı yükseliş FOMO/tuzak ilişkisi?
  const fomoHigh = events.filter(e => e.prev15mChange >= 80);
  const fomoLow = events.filter(e => e.prev15mChange < 50);

  // Q4: Vol/Liq ayırıcı sinyal mi?
  const highVolLiq = events.filter(e => e.volToLiq >= 80);
  const lowVolLiq = events.filter(e => e.volToLiq < 40);

  // Q5: BUY USD / SELL USD vs buyer ratio
  const highBuyUsd = events.filter(e => e.buyUsdT0 > e.sellUsdT0 * 1.5);
  const highBuyerRatio = events.filter(e => e.buyerRatioT0 > 0.65);

  // Q6: Likidite + Holder yapısı (Sağlıklı vs Zayıf)
  const healthyStructure = events.filter(e => e.top10RateT0 <= 20 && e.liquidityT0 >= 5000);
  const weakStructure = events.filter(e => e.top10RateT0 > 35 || e.liquidityT0 < 2000);

  // Q7: KOL / Smart Money olmayan tokenlarda runner davranışı
  const noKolNoSm = events.filter(e => e.hasSmartMoney === 0 && e.hasKOL === 0);
  const withKolOrSm = events.filter(e => e.hasSmartMoney > 0 || e.hasKOL > 0);

  // Q8: +1m/+2m yeşil teyit faydası
  // Examined above in Strategy C

  // Q9: Yeşil teyidin yanlış sinyal verdiği koşullar
  const falseGreenSignals = events.filter(e => e.bothGreen && e.collapsed15m);
  const falseGreenHighPrev = falseGreenSignals.filter(e => e.prev15mChange >= 70).length;
  const falseGreenHighVolLiq = falseGreenSignals.filter(e => e.volToLiq >= 70).length;

  // 4. Current Bot Decision vs Research Classification Cross-tabulation
  const botBuyEvents = events.filter(e => e.currentBotDecision === "BUY");
  const botPassEvents = events.filter(e => e.currentBotDecision === "PASS");

  const crossTab: Record<string, { botBuy: number; botPass: number }> = {};
  for (const c of classes) {
    crossTab[c] = {
      botBuy: botBuyEvents.filter(e => e.researchClassification === c).length,
      botPass: botPassEvents.filter(e => e.researchClassification === c).length
    };
  }

  const analysisSummary = {
    totalEvents: events.length,
    tokensCount: data.tokensAnalyzed,
    classStats,
    confirmationComparison: {
      totalDrops: dropEvents.length,
      t0Only: {
        count: dropEvents.length,
        recoveryRate: pct(t0OnlyRec, dropEvents.length),
        collapseRate: pct(t0OnlyCol, dropEvents.length)
      },
      t1Green: {
        count: t1GreenEvents.length,
        recoveryRate: pct(t1GreenRec, t1GreenEvents.length),
        collapseRate: pct(t1GreenCol, t1GreenEvents.length)
      },
      t2DoubleGreen: {
        count: t2GreenEvents.length,
        recoveryRate: pct(t2GreenRec, t2GreenEvents.length),
        collapseRate: pct(t2GreenCol, t2GreenEvents.length)
      },
      doubleRed: {
        count: doubleRedEvents.length,
        recoveryRate: pct(doubleRedRec, doubleRedEvents.length),
        collapseRate: pct(doubleRedCol, doubleRedEvents.length)
      }
    },
    nineQuestions: {
      q1_redCandleOnly: {
        count: q1RedCandles.length,
        recoveredPct: pct(q1Recovered, q1RedCandles.length),
        collapsedPct: pct(q1Collapsed, q1RedCandles.length),
        immediateBouncePct: pct(q1BounceAfter, q1RedCandles.length)
      },
      q2_buyerFollowThrough: {
        bothGreen: {
          count: q2BothGreen.length,
          recoveryRate: pct(q2BothGreen.filter(e => e.recovered15m).length, q2BothGreen.length),
          collapseRate: pct(q2BothGreen.filter(e => e.collapsed15m).length, q2BothGreen.length),
          meanGain: mean(q2BothGreen.map(e => e.max15)).toFixed(1)
        },
        bothRed: {
          count: q2BothRed.length,
          recoveryRate: pct(q2BothRed.filter(e => e.recovered15m).length, q2BothRed.length),
          collapseRate: pct(q2BothRed.filter(e => e.collapsed15m).length, q2BothRed.length),
          meanGain: mean(q2BothRed.map(e => e.max15)).toFixed(1)
        }
      },
      q3_prev15mFomo: {
        highPrev15m: {
          count: fomoHigh.length,
          collapseRate: pct(fomoHigh.filter(e => e.collapsed15m).length, fomoHigh.length),
          recoveryRate: pct(fomoHigh.filter(e => e.recovered15m).length, fomoHigh.length),
          meanDrawdown: mean(fomoHigh.map(e => e.min15)).toFixed(1)
        },
        lowPrev15m: {
          count: fomoLow.length,
          collapseRate: pct(fomoLow.filter(e => e.collapsed15m).length, fomoLow.length),
          recoveryRate: pct(fomoLow.filter(e => e.recovered15m).length, fomoLow.length),
          meanDrawdown: mean(fomoLow.map(e => e.min15)).toFixed(1)
        }
      },
      q4_volToLiq: {
        highVolLiq: {
          count: highVolLiq.length,
          collapseRate: pct(highVolLiq.filter(e => e.collapsed15m).length, highVolLiq.length),
          meanDrawdown: mean(highVolLiq.map(e => e.min15)).toFixed(1)
        },
        lowVolLiq: {
          count: lowVolLiq.length,
          collapseRate: pct(lowVolLiq.filter(e => e.collapsed15m).length, lowVolLiq.length),
          meanDrawdown: mean(lowVolLiq.map(e => e.min15)).toFixed(1)
        }
      },
      q5_buyUsdVsBuyerRatio: {
        highBuyUsdVolume: {
          count: highBuyUsd.length,
          recoveryRate: pct(highBuyUsd.filter(e => e.recovered15m).length, highBuyUsd.length)
        },
        highBuyerRatioCount: {
          count: highBuyerRatio.length,
          recoveryRate: pct(highBuyerRatio.filter(e => e.recovered15m).length, highBuyerRatio.length)
        }
      },
      q6_structure: {
        healthy: {
          count: healthyStructure.length,
          recoveryRate: pct(healthyStructure.filter(e => e.recovered15m).length, healthyStructure.length),
          collapseRate: pct(healthyStructure.filter(e => e.collapsed15m).length, healthyStructure.length)
        },
        weak: {
          count: weakStructure.length,
          recoveryRate: pct(weakStructure.filter(e => e.recovered15m).length, weakStructure.length),
          collapseRate: pct(weakStructure.filter(e => e.collapsed15m).length, weakStructure.length)
        }
      },
      q7_kolSmartMoney: {
        noKolNoSm: {
          count: noKolNoSm.length,
          runners: noKolNoSm.filter(e => e.max15 >= 30).length,
          runnerRate: pct(noKolNoSm.filter(e => e.max15 >= 30).length, noKolNoSm.length),
          recoveryRate: pct(noKolNoSm.filter(e => e.recovered15m).length, noKolNoSm.length)
        },
        withKolOrSm: {
          count: withKolOrSm.length,
          runners: withKolOrSm.filter(e => e.max15 >= 30).length,
          runnerRate: pct(withKolOrSm.filter(e => e.max15 >= 30).length, withKolOrSm.length),
          recoveryRate: pct(withKolOrSm.filter(e => e.recovered15m).length, withKolOrSm.length)
        }
      },
      q9_falseGreenConditions: {
        totalFalseGreen: falseGreenSignals.length,
        highPrev15mShare: pct(falseGreenHighPrev, falseGreenSignals.length),
        highVolLiqShare: pct(falseGreenHighVolLiq, falseGreenSignals.length)
      }
    },
    crossTab,
    decisionLogSample: data.decisionLog.slice(0, 8)
  };

  fs.writeFileSync("./phase5_metrics.json", JSON.stringify(analysisSummary, null, 2));
  console.log("Analysis completed successfully and saved to phase5_metrics.json!");
  console.log("\n--- Class Breakdown ---");
  console.table(classStats);
  console.log("\n--- Confirmation Comparison ---");
  console.log(analysisSummary.confirmationComparison);
  console.log("\n--- Cross-Tab (Bot Decision vs Research Class) ---");
  console.table(crossTab);
}

runAnalysis();
