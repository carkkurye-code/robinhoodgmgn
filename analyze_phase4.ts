import fs from "fs";

interface Kline {
  time: number;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  amount?: string;
}

interface TokenItem {
  symbol: string;
  name: string;
  address: string;
  meta: any;
  info: any;
  sec: any;
  klines: Kline[];
  klinesCount: number;
}

interface EventData {
  tokenSymbol: string;
  tokenAddress: string;
  t0_index: number;
  t0_time: number;
  
  // T0 Known Metrics
  openP: number;
  closeP: number;
  candleChange: number;
  candleVol: number;
  liq: number;
  mc: number;
  holderCount: number;
  top10Rate: number;
  sniperRate: number;
  bundlerRate: number;
  devHoldRate: number;
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  volToLiq: number;
  prev5mChange: number;
  prev15mChange: number;
  priorSmBuyCount: number;
  priorSmSellCount: number;
  priorSmBuyUsd: number;
  priorSmSellUsd: number;
  priorKolBuyCount: number;
  priorKolSellCount: number;
  priorKolBuyUsd: number;
  priorKolSellUsd: number;

  // Post-T0 Confirmation (strictly separated)
  next1Change: number;
  next2Change: number;
  next1Vol: number;
  next2Vol: number;
  absorptionRatio2m: number;
  isNext1Green: boolean;
  isBothGreen: boolean;
  isBothRed: boolean;

  // Future Outcomes (strictly evaluation)
  max5: number;
  min5: number;
  max15: number;
  min15: number;
  max30: number;
  min30: number;
  recovered15m: boolean;
  collapsed15m: boolean;
  finalOutcomeClass: string;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function runAnalysis() {
  console.log("=== PHASE 4: OUT-OF-SAMPLE ANALYSIS & VALIDATION ===");

  if (!fs.existsSync("./phase4_raw_data.json")) {
    console.error("phase4_raw_data.json not found!");
    return;
  }

  const raw = JSON.parse(fs.readFileSync("./phase4_raw_data.json", "utf8"));
  const p3Raw = JSON.parse(fs.readFileSync("./phase3_raw_data.json", "utf8"));

  const p3Addresses = new Set(p3Raw.tokenDataList.map((t: any) => t.address.toLowerCase()));
  const p4Tokens: TokenItem[] = raw.tokenDataList || [];

  console.log(`Total Phase 4 raw tokens collected: ${p4Tokens.length}`);
  
  // Independent check
  const overlapTokens = p4Tokens.filter(t => p3Addresses.has(t.address.toLowerCase()));
  const independentTokens = p4Tokens.filter(t => !p3Addresses.has(t.address.toLowerCase()));
  console.log(`Independent tokens (NOT in Phase 3): ${independentTokens.length}`);
  console.log(`Overlap tokens: ${overlapTokens.length}`);

  // SM and KOL maps
  const smTrades = raw.smTrades || [];
  const kolTrades = raw.kolTrades || [];

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

  // Token-level overview
  console.log("\n=== TOKEN-LEVEL OVERVIEW (OUT-OF-SAMPLE) ===");
  const tokenSummaries = independentTokens.map(t => {
    const klines = t.klines || [];
    const openP = klines[0] ? Number(klines[0].open) : 0;
    const maxP = klines.reduce((m, k) => Math.max(m, Number(k.high)), 0);
    const endP = klines[klines.length - 1] ? Number(klines[klines.length - 1].close) : 0;
    const maxRun = openP > 0 ? ((maxP - openP) / openP) * 100 : 0;
    const finalReturn = openP > 0 ? ((endP - openP) / openP) * 100 : 0;
    const liq = Number(t.info?.liquidity || t.meta?.liquidity || 0);
    const mc = Number(t.info?.market_cap || t.meta?.market_cap || 0);
    const holders = Number(t.info?.holder_count || t.meta?.holder_count || 0);
    const top10 = Number(t.sec?.top_10_holder_rate || t.meta?.top_10_holder_rate || 0);

    return {
      symbol: t.symbol,
      address: t.address,
      klinesCount: klines.length,
      liq,
      mc,
      holders,
      top10,
      maxRun,
      finalReturn,
      category: maxRun >= 100 ? "HIGH_RUNNER" : maxRun >= 30 ? "MID_RUNNER" : finalReturn <= -40 ? "COLLAPSE" : "FLAT"
    };
  });

  console.log("Tokens analyzed:", tokenSummaries.length);
  const byCategory: Record<string, number> = {};
  tokenSummaries.forEach(s => byCategory[s.category] = (byCategory[s.category] || 0) + 1);
  console.log("Category counts:", byCategory);

  // Generate Events for tokens with >= 20 klines
  const validTokens = independentTokens.filter(t => (t.klines || []).length >= 20);
  console.log(`Tokens with >= 20 klines for event analysis: ${validTokens.length}`);

  const allEvents: EventData[] = [];

  for (const item of validTokens) {
    const klines = item.klines;
    const addr = item.address.toLowerCase();
    const info = item.info || {};
    const meta = item.meta || {};
    const sec = item.sec || {};

    const liq = Number(info.liquidity || meta.liquidity || 5000);
    const mc = Number(info.market_cap || meta.market_cap || 10000);
    const holderCount = Number(info.holder_count || meta.holder_count || 0);
    const top10Rate = Number(sec.top_10_holder_rate || meta.top_10_holder_rate || 0);
    const sniperRate = Number(sec.top70_sniper_hold_rate || meta.top70_sniper_hold_rate || 0);
    const bundlerRate = Number(sec.top_bundler_trader_percentage || meta.bundler_rate || 0);
    const devHoldRate = Number(sec.dev_token_burn_ratio || meta.dev_team_hold_rate || 0);
    const isHoneypot = sec.is_honeypot === true || sec.is_honeypot === 1 || sec.is_honeypot === "yes";
    const buyTax = Number(sec.buy_tax || 0);
    const sellTax = Number(sec.sell_tax || 0);

    const tokenSms = smMap.get(addr) || [];
    const tokenKols = kolMap.get(addr) || [];

    // Stride 2 to sample inflection events
    const startIdx = Math.min(10, Math.floor(klines.length / 4));
    const endIdx = klines.length - 10;

    for (let i = startIdx; i < endIdx; i += 2) {
      const c = klines[i];
      const t0_time = Math.floor(c.time / 1000);
      const openP = Number(c.open);
      const closeP = Number(c.close);
      const candleChange = openP > 0 ? ((closeP - openP) / openP) * 100 : 0;
      const candleVol = Number(c.volume);
      const volToLiq = liq > 0 ? (candleVol / liq) * 100 : 0;

      const p5Idx = Math.max(0, i - 5);
      const p15Idx = Math.max(0, i - 15);
      const p5Open = Number(klines[p5Idx].open);
      const p15Open = Number(klines[p15Idx].open);
      const prev5mChange = p5Open > 0 ? ((closeP - p5Open) / p5Open) * 100 : 0;
      const prev15mChange = p15Open > 0 ? ((closeP - p15Open) / p15Open) * 100 : 0;

      // Prior SM & KOL
      const priorSms = tokenSms.filter((t: any) => t.timestamp <= t0_time);
      const priorKols = tokenKols.filter((t: any) => t.timestamp <= t0_time);

      const priorSmBuys = priorSms.filter((t: any) => t.side === "buy");
      const priorSmSells = priorSms.filter((t: any) => t.side === "sell");
      const priorSmBuyUsd = priorSmBuys.reduce((s: number, t: any) => s + Number(t.amount_usd || 0), 0);
      const priorSmSellUsd = priorSmSells.reduce((s: number, t: any) => s + Number(t.amount_usd || 0), 0);

      const priorKolBuys = priorKols.filter((t: any) => t.side === "buy");
      const priorKolSells = priorKols.filter((t: any) => t.side === "sell");
      const priorKolBuyUsd = priorKolBuys.reduce((s: number, t: any) => s + Number(t.amount_usd || 0), 0);
      const priorKolSellUsd = priorKolSells.reduce((s: number, t: any) => s + Number(t.amount_usd || 0), 0);

      // Post-T0 confirmation
      const next1 = klines[i + 1];
      const next2 = klines[i + 2];
      const next1Open = next1 ? Number(next1.open) : 0;
      const next1Close = next1 ? Number(next1.close) : 0;
      const next2Open = next2 ? Number(next2.open) : 0;
      const next2Close = next2 ? Number(next2.close) : 0;

      const next1Change = next1Open > 0 ? ((next1Close - next1Open) / next1Open) * 100 : 0;
      const next2Change = next2Open > 0 ? ((next2Close - next2Open) / next2Open) * 100 : 0;
      const next1Vol = Number(next1?.volume || 0);
      const next2Vol = Number(next2?.volume || 0);
      const absorptionRatio2m = candleVol > 0 ? (next1Vol + next2Vol) / candleVol : 0;

      const isNext1Green = next1Change > 0;
      const isBothGreen = next1Change > 0 && next2Change > 0;
      const isBothRed = next1Change < 0 && next2Change < 0;

      // Future outcomes
      let max5 = -Infinity, min5 = Infinity;
      let max15 = -Infinity, min15 = Infinity;
      let max30 = -Infinity, min30 = Infinity;

      for (let j = 1; j <= 5 && (i + j) < klines.length; j++) {
        const p = Number(klines[i + j].close);
        const g = ((p - closeP) / closeP) * 100;
        if (g > max5) max5 = g;
        if (g < min5) min5 = g;
      }
      for (let j = 1; j <= 15 && (i + j) < klines.length; j++) {
        const p = Number(klines[i + j].close);
        const g = ((p - closeP) / closeP) * 100;
        if (g > max15) max15 = g;
        if (g < min15) min15 = g;
      }
      for (let j = 1; j <= 30 && (i + j) < klines.length; j++) {
        const p = Number(klines[i + j].close);
        const g = ((p - closeP) / closeP) * 100;
        if (g > max30) max30 = g;
        if (g < min30) min30 = g;
      }

      const recovered15m = max15 >= 15 && min15 > -25;
      const collapsed15m = min15 <= -35 && max15 < 15;

      let finalOutcomeClass = "F";
      if (max15 >= 50) finalOutcomeClass = "A";
      else if (max30 >= 50 && max15 < 30) finalOutcomeClass = "B";
      else if (candleChange <= -12 && recovered15m) finalOutcomeClass = "D";
      else if (min15 <= -45 && max15 < 10) finalOutcomeClass = "E";
      else if (candleChange <= -15 && min30 <= -60) finalOutcomeClass = "H";
      else if (prev15mChange >= 100 && min15 <= -30) finalOutcomeClass = "G";
      else if (max5 >= 10 && min15 <= -35) finalOutcomeClass = "C";

      allEvents.push({
        tokenSymbol: item.symbol,
        tokenAddress: addr,
        t0_index: i,
        t0_time,
        openP,
        closeP,
        candleChange,
        candleVol,
        liq,
        mc,
        holderCount,
        top10Rate,
        sniperRate,
        bundlerRate,
        devHoldRate,
        isHoneypot,
        buyTax,
        sellTax,
        volToLiq,
        prev5mChange,
        prev15mChange,
        priorSmBuyCount: priorSmBuys.length,
        priorSmSellCount: priorSmSells.length,
        priorSmBuyUsd,
        priorSmSellUsd,
        priorKolBuyCount: priorKolBuys.length,
        priorKolSellCount: priorKolSells.length,
        priorKolBuyUsd,
        priorKolSellUsd,
        next1Change,
        next2Change,
        next1Vol,
        next2Vol,
        absorptionRatio2m,
        isNext1Green,
        isBothGreen,
        isBothRed,
        max5, min5,
        max15, min15,
        max30, min30,
        recovered15m,
        collapsed15m,
        finalOutcomeClass
      });
    }
  }

  console.log(`\nTotal independent Phase 4 Events generated: ${allEvents.length}`);

  // Summary of classes in Phase 4
  const phase4ClassCounts: Record<string, number> = {};
  allEvents.forEach(e => phase4ClassCounts[e.finalOutcomeClass] = (phase4ClassCounts[e.finalOutcomeClass] || 0) + 1);
  console.log("Phase 4 Class distribution:", phase4ClassCounts);

  // Write out events to stats file
  fs.writeFileSync("./phase4_analyzed_events.json", JSON.stringify({
    tokenSummaries,
    eventsCount: allEvents.length,
    events: allEvents
  }, null, 2));

  console.log("Analysis ready. Events saved to phase4_analyzed_events.json");
}

runAnalysis();
