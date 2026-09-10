import fs from "fs";

interface EventPoint {
  tokenSymbol: string;
  tokenAddress: string;
  t0_time: string;
  t0_index: number;
  
  // T0 state (strictly available at decision time)
  t0_price: number;
  t0_mc: number;
  t0_liq: number;
  t0_holderCount: number;
  t0_top10Rate: number;
  t0_sniperRate: number;
  t0_bundlerRate: number;
  t0_devHoldRate: number;
  t0_prev5mGain: number;
  t0_prev15mGain: number;
  t0_candleDrop: number;
  t0_candleVol: number;
  t0_dropVolToLiq: number;
  t0_hasKolPrior: boolean;
  t0_kolCountPrior: number;
  t0_hasSmPrior: boolean;
  t0_smCountPrior: number;
  t0_smNetPriorUsd: number;
  
  // T0+1m and T0+2m absorption reaction
  follow1mVol: number;
  follow1mChange: number;
  follow2mVol: number;
  follow2mChange: number;
  absorptionRatio2m: number;
  
  // Future outcomes (strictly evaluated AFTER T0 for outcome verification)
  t_plus5m_maxGain: number;
  t_plus5m_minDrop: number;
  t_plus15m_maxGain: number;
  t_plus15m_minDrop: number;
  t_plus30m_maxGain: number;
  t_plus30m_minDrop: number;
  recovered15m: boolean;
  isFakeRecovery: boolean; // recovered in first 3 mins but crashed > 40% by 15m
  finalOutcomeClass: string; // A, B, C, D, E, F, G, H
}

function runAnalysis() {
  if (!fs.existsSync("./phase3_raw_data.json")) {
    console.log("phase3_raw_data.json not ready yet.");
    return;
  }

  const raw = JSON.parse(fs.readFileSync("./phase3_raw_data.json", "utf8"));
  const { smTrades, kolTrades, tokenDataList } = raw;

  console.log(`Loaded dataset: ${tokenDataList.length} tokens, ${smTrades.length} SM trades, ${kolTrades.length} KOL trades.`);

  // Map SM and KOL by address with timestamp
  const smMap = new Map<string, any[]>();
  for (const t of smTrades) {
    const a = (t.base_address || "").toLowerCase();
    if (!smMap.has(a)) smMap.set(a, []);
    smMap.get(a)!.push(t);
  }

  const kolMap = new Map<string, any[]>();
  for (const t of kolTrades) {
    const a = (t.base_address || "").toLowerCase();
    if (!kolMap.has(a)) kolMap.set(a, []);
    kolMap.get(a)!.push(t);
  }

  const events: EventPoint[] = [];

  for (const item of tokenDataList) {
    const klines = item.klines || [];
    if (klines.length < 35) continue; // need at least 35 candles for T0 and T+30m evaluation

    const addr = item.address.toLowerCase();
    const info = item.info || {};
    const meta = item.meta || {};
    const sec = item.sec || {};

    const liq = Number(info.liquidity || meta.liquidity || 10000);
    const mc = Number(info.market_cap || info.realtime_market_cap || meta.market_cap || 30000);
    const holderCount = Number(info.holder_count || meta.holderCount || 0);
    const top10Rate = Number(info.top_10_holder_rate || 0);
    const sniperRate = Number(meta.sniperRate || info.top70_sniper_hold_rate || 0);
    const bundlerRate = Number(meta.bundlerRate || 0);
    const devHoldRate = Number(meta.devHoldRate || info.dev_team_hold_rate || 0);

    const tokenSms = smMap.get(addr) || [];
    const tokenKols = kolMap.get(addr) || [];

    // Scan through candles to identify key inflection points:
    // Inflection points:
    // 1. Dips (drops >= 10%)
    // 2. Breakouts (gains >= 15%)
    // 3. Early accumulation (first 10 candles)
    for (let i = 15; i < klines.length - 16; i += 3) {
      const c = klines[i];
      const t0_timestamp = Math.floor(c.time / 1000);
      const openP = Number(c.open);
      const closeP = Number(c.close);
      const candleDrop = ((closeP - openP) / openP) * 100;
      const candleVol = Number(c.volume);

      // Prior 5m and 15m price changes
      const p5 = Number(klines[i - 5].open);
      const p15 = Number(klines[i - 15].open);
      const prev5mGain = ((closeP - p5) / p5) * 100;
      const prev15mGain = ((closeP - p15) / p15) * 100;

      // Data leakage check: only count SM & KOL trades that occurred BEFORE or AT t0_timestamp
      const priorSms = tokenSms.filter(t => t.timestamp <= t0_timestamp);
      const priorKols = tokenKols.filter(t => t.timestamp <= t0_timestamp);

      const smMakers = new Set(priorSms.map(t => t.maker));
      let smNetUsd = 0;
      for (const t of priorSms) {
        if (t.side === "buy") smNetUsd += Number(t.amount_usd || 0);
        else smNetUsd -= Number(t.amount_usd || 0);
      }

      const kolMakers = new Set(priorKols.map(t => t.maker_info?.twitter_name || t.maker));

      // Follow-up 1m and 2m reactions
      const next1 = klines[i + 1];
      const next2 = klines[i + 2];
      const next1Vol = Number(next1?.volume || 0);
      const next2Vol = Number(next2?.volume || 0);
      const next1Change = next1 ? ((Number(next1.close) - Number(next1.open)) / Number(next1.open)) * 100 : 0;
      const next2Change = next2 ? ((Number(next2.close) - Number(next2.open)) / Number(next2.open)) * 100 : 0;
      const absorptionRatio2m = candleVol > 0 ? (next1Vol + next2Vol) / candleVol : 0;

      // Future outcomes across 5m, 15m, 30m
      let max5 = -Infinity, min5 = Infinity;
      let max15 = -Infinity, min15 = Infinity;
      let max30 = -Infinity, min30 = Infinity;

      for (let j = 1; j <= 5 && (i + j) < klines.length; j++) {
        const p = Number(klines[i + j].close);
        const gain = ((p - closeP) / closeP) * 100;
        if (gain > max5) max5 = gain;
        if (gain < min5) min5 = gain;
      }

      for (let j = 1; j <= 15 && (i + j) < klines.length; j++) {
        const p = Number(klines[i + j].close);
        const gain = ((p - closeP) / closeP) * 100;
        if (gain > max15) max15 = gain;
        if (gain < min15) min15 = gain;
      }

      const t30Limit = Math.min(30, klines.length - 1 - i);
      for (let j = 1; j <= t30Limit; j++) {
        const p = Number(klines[i + j].close);
        const gain = ((p - closeP) / closeP) * 100;
        if (gain > max30) max30 = gain;
        if (gain < min30) min30 = gain;
      }

      const recovered15m = max15 >= (Math.abs(candleDrop) * 0.85) || max15 >= 10;
      const isFakeRecovery = (max5 >= 8 && min15 <= -25);

      // Behavior classification
      let outcomeClass = "UNKNOWN";
      if (candleDrop <= -12) {
        if (recovered15m && max15 >= 20) outcomeClass = "D"; // Post-dump recovery
        else if (isFakeRecovery) outcomeClass = "C"; // Fake breakout / fake recovery
        else outcomeClass = "E"; // Post-dump collapse
      } else if (prev15mGain >= 150 && max15 < -15) {
        outcomeClass = "G"; // FOMO / Top formation
      } else if (max30 >= 100 && prev15mGain < 50) {
        outcomeClass = "A"; // Early real runner
      } else if (max30 >= 50 && prev15mGain >= 80) {
        outcomeClass = "B"; // Late runner
      } else if (Math.abs(max15) < 15 && Math.abs(min15) < 15 && candleVol > 500) {
        outcomeClass = "F"; // Slow accumulation
      } else if (min15 <= -60 || min30 <= -75) {
        outcomeClass = "H"; // Rug / Liquidity failure
      } else {
        outcomeClass = max15 > 0 ? "F" : "E";
      }

      events.push({
        tokenSymbol: item.symbol,
        tokenAddress: item.address,
        t0_time: new Date(c.time).toISOString(),
        t0_index: i,
        t0_price: closeP,
        t0_mc: mc,
        t0_liq: liq,
        t0_holderCount: holderCount,
        t0_top10Rate: top10Rate,
        t0_sniperRate: sniperRate,
        t0_bundlerRate: bundlerRate,
        t0_devHoldRate: devHoldRate,
        t0_prev5mGain: prev5mGain,
        t0_prev15mGain: prev15mGain,
        t0_candleDrop: candleDrop,
        t0_candleVol: candleVol,
        t0_dropVolToLiq: liq > 0 ? (candleVol / liq) * 100 : 0,
        t0_hasKolPrior: kolMakers.size > 0,
        t0_kolCountPrior: kolMakers.size,
        t0_hasSmPrior: smMakers.size > 0,
        t0_smCountPrior: smMakers.size,
        t0_smNetPriorUsd: smNetUsd,
        follow1mVol: next1Vol,
        follow1mChange: next1Change,
        follow2mVol: next2Vol,
        follow2mChange: next2Change,
        absorptionRatio2m,
        t_plus5m_maxGain: max5,
        t_plus5m_minDrop: min5,
        t_plus15m_maxGain: max15,
        t_plus15m_minDrop: min15,
        t_plus30m_maxGain: max30,
        t_plus30m_minDrop: min30,
        recovered15m,
        isFakeRecovery,
        finalOutcomeClass: outcomeClass,
      });
    }
  }

  console.log(`\n======================================================`);
  console.log(`PHASE 3 STATISTICAL RESULTS (Total Events: ${events.length})`);
  console.log(`======================================================`);

  // Class breakdown
  const countsByClass: Record<string, number> = {};
  for (const e of events) {
    countsByClass[e.finalOutcomeClass] = (countsByClass[e.finalOutcomeClass] || 0) + 1;
  }
  console.log("Event distribution by behavior class:", countsByClass);

  // 1. HUNTER VS PREY SIGNALS: ABSORPTION
  const dumpEvents = events.filter(e => e.t0_candleDrop <= -12);
  console.log(`\n--- 1. ABSORPTION IN DUMPS (Total Dumps: ${dumpEvents.length}) ---`);
  const absTiers = [
    { name: "Very High (>= 1.5x)", filter: (e: EventPoint) => e.absorptionRatio2m >= 1.5 },
    { name: "High (1.0x - 1.5x)", filter: (e: EventPoint) => e.absorptionRatio2m >= 1.0 && e.absorptionRatio2m < 1.5 },
    { name: "Moderate (0.5x - 1.0x)", filter: (e: EventPoint) => e.absorptionRatio2m >= 0.5 && e.absorptionRatio2m < 1.0 },
    { name: "Low (0.2x - 0.5x)", filter: (e: EventPoint) => e.absorptionRatio2m >= 0.2 && e.absorptionRatio2m < 0.5 },
    { name: "Dried Up (< 0.2x)", filter: (e: EventPoint) => e.absorptionRatio2m < 0.2 },
  ];

  for (const tier of absTiers) {
    const list = dumpEvents.filter(tier.filter);
    const rec = list.filter(e => e.recovered15m).length;
    const fake = list.filter(e => e.isFakeRecovery).length;
    const rate = list.length > 0 ? ((rec / list.length) * 100).toFixed(1) : "0.0";
    console.log(`${tier.name}: Count: ${list.length} | Recovered: ${rec} (${rate}%) | Fake Rec: ${fake}`);
  }

  // 2. TIMING: 1m vs 2m FOLLOW-UP
  console.log(`\n--- 2. TIMING: 1 MINUTE VS 2 MINUTES REACTION ---`);
  const green1m = dumpEvents.filter(e => e.follow1mChange > 0);
  const green2m = dumpEvents.filter(e => e.follow2mChange > 0);
  const greenBoth = dumpEvents.filter(e => e.follow1mChange > 0 && e.follow2mChange > 0);
  const redBoth = dumpEvents.filter(e => e.follow1mChange <= 0 && e.follow2mChange <= 0);

  console.log(`Follow-up +1m Green: ${green1m.length} | Recovery: ${((green1m.filter(e => e.recovered15m).length / (green1m.length || 1)) * 100).toFixed(1)}%`);
  console.log(`Follow-up Both +1m & +2m Green: ${greenBoth.length} | Recovery: ${((greenBoth.filter(e => e.recovered15m).length / (greenBoth.length || 1)) * 100).toFixed(1)}%`);
  console.log(`Follow-up Both +1m & +2m Red (Cascading): ${redBoth.length} | Recovery: ${((redBoth.filter(e => e.recovered15m).length / (redBoth.length || 1)) * 100).toFixed(1)}% | Crash Rate: ${((redBoth.filter(e => !e.recovered15m).length / (redBoth.length || 1)) * 100).toFixed(1)}%`);

  // 3. KOL & SMART MONEY: TIMING (EARLY VS LATE)
  console.log(`\n--- 3. KOL TIMING: EARLY RUNNER VS FOMO TOP ---`);
  const kol0 = events.filter(e => e.t0_kolCountPrior === 0);
  const kol1Early = events.filter(e => e.t0_kolCountPrior === 1 && e.t0_prev15mGain < 80);
  const kol1Late = events.filter(e => e.t0_kolCountPrior === 1 && e.t0_prev15mGain >= 80);
  const kolMulti = events.filter(e => e.t0_kolCountPrior >= 2);

  console.log(`0 KOL Prior: ${kol0.length} events | 15m Max Gain >= +30%: ${((kol0.filter(e => e.t_plus15m_maxGain >= 30).length / (kol0.length || 1)) * 100).toFixed(1)}% | 15m Crash <= -30%: ${((kol0.filter(e => e.t_plus15m_minDrop <= -30).length / (kol0.length || 1)) * 100).toFixed(1)}%`);
  console.log(`1 KOL Prior (Early, Prev15m < 80%): ${kol1Early.length} events | 15m Max Gain >= +30%: ${((kol1Early.filter(e => e.t_plus15m_maxGain >= 30).length / (kol1Early.length || 1)) * 100).toFixed(1)}% | 15m Crash <= -30%: ${((kol1Early.filter(e => e.t_plus15m_minDrop <= -30).length / (kol1Early.length || 1)) * 100).toFixed(1)}%`);
  console.log(`1 KOL Prior (Late/Extended, Prev15m >= 80%): ${kol1Late.length} events | 15m Max Gain >= +30%: ${((kol1Late.filter(e => e.t_plus15m_maxGain >= 30).length / (kol1Late.length || 1)) * 100).toFixed(1)}% | 15m Crash <= -30%: ${((kol1Late.filter(e => e.t_plus15m_minDrop <= -30).length / (kol1Late.length || 1)) * 100).toFixed(1)}%`);
  console.log(`2+ KOL Prior (FOMO / Heavy Crowd): ${kolMulti.length} events | 15m Max Gain >= +30%: ${((kolMulti.filter(e => e.t_plus15m_maxGain >= 30).length / (kolMulti.length || 1)) * 100).toFixed(1)}% | 15m Crash <= -30%: ${((kolMulti.filter(e => e.t_plus15m_minDrop <= -30).length / (kolMulti.length || 1)) * 100).toFixed(1)}%`);

  // 4. COMBINATIONS TEST
  console.log(`\n--- 4. MULTI-SIGNAL COMBINATIONS (Hunter Score Archetypes) ---`);
  // Hunter combo: Early runner (prev15m < 80%) + Low liq ($8k-$45k) + (SM or KOL >= 1)
  const hunterCombo = events.filter(e => e.t0_prev15mGain < 80 && e.t0_liq >= 8000 && e.t0_liq <= 50000 && (e.t0_hasKolPrior || e.t0_hasSmPrior));
  // Prey combo: Extended (prev15m >= 120%) + High top10 (> 40%) OR low absorption on dip
  const preyCombo = events.filter(e => e.t0_prev15mGain >= 120 || (e.t0_candleDrop <= -12 && e.absorptionRatio2m < 0.3));

  console.log(`Hunter Archetype: ${hunterCombo.length} events | Success (>= +30% in 15m): ${hunterCombo.filter(e => e.t_plus15m_maxGain >= 30).length} (${((hunterCombo.filter(e => e.t_plus15m_maxGain >= 30).length / (hunterCombo.length || 1)) * 100).toFixed(1)}%) | Severe Loss (<= -30%): ${hunterCombo.filter(e => e.t_plus15m_minDrop <= -30).length} (${((hunterCombo.filter(e => e.t_plus15m_minDrop <= -30).length / (hunterCombo.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`Prey Archetype: ${preyCombo.length} events | Severe Loss (<= -30%): ${preyCombo.filter(e => e.t_plus15m_minDrop <= -30).length} (${((preyCombo.filter(e => e.t_plus15m_minDrop <= -30).length / (preyCombo.length || 1)) * 100).toFixed(1)}%) | Gain (>= +30%): ${preyCombo.filter(e => e.t_plus15m_maxGain >= 30).length} (${((preyCombo.filter(e => e.t_plus15m_maxGain >= 30).length / (preyCombo.length || 1)) * 100).toFixed(1)}%)`);

  fs.writeFileSync("./phase3_summary_stats.json", JSON.stringify({
    totalEvents: events.length,
    countsByClass,
    hunterCount: hunterCombo.length,
    hunterSuccess: hunterCombo.filter(e => e.t_plus15m_maxGain >= 30).length,
    preyCount: preyCombo.length,
    preySevereLoss: preyCombo.filter(e => e.t_plus15m_minDrop <= -30).length,
    sampleEvents: events.slice(0, 20),
  }, null, 2));

  console.log("\nPhase 3 summary written to phase3_summary_stats.json");
}

runAnalysis();
