import fs from "fs";

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

const p3Raw = JSON.parse(fs.readFileSync("./phase3_raw_data.json", "utf8"));
const p4Raw = JSON.parse(fs.readFileSync("./phase4_raw_data.json", "utf8"));
const p4EventsData = JSON.parse(fs.readFileSync("./phase4_analyzed_events.json", "utf8"));

const p3Tokens = p3Raw.tokenDataList;
const p4Tokens = p4Raw.tokenDataList;
const p4Events = p4EventsData.events;
const p4Summaries = p4EventsData.tokenSummaries;

console.log("=== PHASE 4 COMPREHENSIVE METRICS REPORT ===");

// 1. Dataset stats
console.log("\n--- 1. DATASET STATS ---");
console.log(`Phase 3 Tokens: ${p3Tokens.length}, Total Klines: ${p3Tokens.reduce((s: number, t: any) => s + (t.klines?.length || 0), 0)}`);
console.log(`Phase 4 Tokens: ${p4Tokens.length}, Total Klines: ${p4Tokens.reduce((s: number, t: any) => s + (t.klines?.length || 0), 0)}`);
console.log(`Phase 4 Independent Events: ${p4Events.length}`);

// 2. Token-level analysis (Avoid event dependency inflation)
console.log("\n--- 2. TOKEN-LEVEL STATISTICS ---");
const p4Runners = p4Summaries.filter((t: any) => t.category === "HIGH_RUNNER" || t.category === "MID_RUNNER");
const p4Flats = p4Summaries.filter((t: any) => t.category === "FLAT" || t.category === "COLLAPSE");

console.log(`Runners Count: ${p4Runners.length} (${(p4Runners.length / p4Summaries.length * 100).toFixed(1)}%)`);
console.log(`Flats/Collapses Count: ${p4Flats.length} (${(p4Flats.length / p4Summaries.length * 100).toFixed(1)}%)`);

console.log(`Runners Median Initial Liquidity: $${median(p4Runners.map((t: any) => t.liq)).toFixed(0)}`);
console.log(`Runners Median Holder Count: ${median(p4Runners.map((t: any) => t.holders)).toFixed(0)}`);
console.log(`Runners Median Top 10%: ${(median(p4Runners.map((t: any) => t.top10)) * 100).toFixed(1)}%`);

// 3. Drops analysis (Drops <= -5% and <= -10%)
console.log("\n--- 3. DIP / DROP ANALYSIS (H1, H2, H3, H4) ---");
const drops5 = p4Events.filter((e: any) => e.candleChange <= -5);
const drops10 = p4Events.filter((e: any) => e.candleChange <= -10);

console.log(`Drops <= -5%: N=${drops5.length}`);
console.log(`  Recovered (+15m >= 15%): ${drops5.filter((e: any) => e.recovered15m).length} (${(drops5.filter((e: any) => e.recovered15m).length / drops5.length * 100).toFixed(1)}%)`);
console.log(`  Collapsed (+15m <= -35%): ${drops5.filter((e: any) => e.collapsed15m).length} (${(drops5.filter((e: any) => e.collapsed15m).length / drops5.length * 100).toFixed(1)}%)`);
console.log(`  Median 15m Return: ${median(drops5.map((e: any) => e.max15)).toFixed(1)}%`);

console.log(`Drops <= -10%: N=${drops10.length}`);
console.log(`  Recovered (+15m >= 15%): ${drops10.filter((e: any) => e.recovered15m).length} (${(drops10.filter((e: any) => e.recovered15m).length / (drops10.length || 1) * 100).toFixed(1)}%)`);
console.log(`  Collapsed (+15m <= -35%): ${drops10.filter((e: any) => e.collapsed15m).length} (${(drops10.filter((e: any) => e.collapsed15m).length / (drops10.length || 1) * 100).toFixed(1)}%)`);

// H3 in drops <= -5%
const d5Next1Green = drops5.filter((e: any) => e.isNext1Green);
const d5BothGreen = drops5.filter((e: any) => e.isBothGreen);
const d5BothRed = drops5.filter((e: any) => e.isBothRed);

console.log(`Drops <= -5% with +1m Green: N=${d5Next1Green.length}, Rec Rate: ${(d5Next1Green.filter((e: any) => e.recovered15m).length / (d5Next1Green.length || 1) * 100).toFixed(1)}%, Col Rate: ${(d5Next1Green.filter((e: any) => e.collapsed15m).length / (d5Next1Green.length || 1) * 100).toFixed(1)}%`);
console.log(`Drops <= -5% with Both +1m & +2m Green: N=${d5BothGreen.length}, Rec Rate: ${(d5BothGreen.filter((e: any) => e.recovered15m).length / (d5BothGreen.length || 1) * 100).toFixed(1)}%, Col Rate: ${(d5BothGreen.filter((e: any) => e.collapsed15m).length / (d5BothGreen.length || 1) * 100).toFixed(1)}%`);
console.log(`Drops <= -5% with Both +1m & +2m Red: N=${d5BothRed.length}, Rec Rate: ${(d5BothRed.filter((e: any) => e.recovered15m).length / (d5BothRed.length || 1) * 100).toFixed(1)}%, Col Rate: ${(d5BothRed.filter((e: any) => e.collapsed15m).length / (d5BothRed.length || 1) * 100).toFixed(1)}%`);

// 4. H12: Momentum Expansion & FOMO Trap
console.log("\n--- 4. H12: MOMENTUM EXPANSION & FOMO TRAP ---");
const prev15mHigh = p4Events.filter((e: any) => e.prev15mChange >= 80);
const prev15mNormal = p4Events.filter((e: any) => e.prev15mChange < 50);

console.log(`Prev15m >= 80% (Extended): N=${prev15mHigh.length}`);
console.log(`  Collapsed within 15m: ${prev15mHigh.filter((e: any) => e.collapsed15m).length} (${(prev15mHigh.filter((e: any) => e.collapsed15m).length / prev15mHigh.length * 100).toFixed(1)}%)`);
console.log(`  Median Drawdown 15m: ${median(prev15mHigh.map((e: any) => e.min15)).toFixed(1)}%`);
console.log(`  Median Max Gain 15m: ${median(prev15mHigh.map((e: any) => e.max15)).toFixed(1)}%`);

console.log(`Prev15m < 50% (Base/Early): N=${prev15mNormal.length}`);
console.log(`  Collapsed within 15m: ${prev15mNormal.filter((e: any) => e.collapsed15m).length} (${(prev15mNormal.filter((e: any) => e.collapsed15m).length / prev15mNormal.length * 100).toFixed(1)}%)`);
console.log(`  Median Drawdown 15m: ${median(prev15mNormal.map((e: any) => e.min15)).toFixed(1)}%`);
console.log(`  Median Max Gain 15m: ${median(prev15mNormal.map((e: any) => e.max15)).toFixed(1)}%`);

// 5. Negative Control Cases (Counter-examples)
console.log("\n--- 5. NEGATIVE CONTROL CASES (COUNTER-EXAMPLES) ---");
// Case 1: Both +1m & +2m green, BUT still collapsed or failed
const failedBothGreen = p4Events.filter((e: any) => e.isBothGreen && e.min15 <= -30);
console.log(`Cases where Both Green occurred but token suffered >= -30% drawdown: ${failedBothGreen.length}`);
if (failedBothGreen.length > 0) {
  console.log("Sample counter-example:", failedBothGreen.slice(0, 3).map((e: any) => ({
    token: e.tokenSymbol,
    t0_idx: e.t0_index,
    candleChange: e.candleChange.toFixed(1),
    next1: e.next1Change.toFixed(1),
    next2: e.next2Change.toFixed(1),
    min15: e.min15.toFixed(1),
    max15: e.max15.toFixed(1),
    prev15m: e.prev15mChange.toFixed(1)
  })));
}

// Case 2: Low liquidity, low holders, BUT failed to run
const lowLiqLowHoldersFlat = p4Summaries.filter((t: any) => t.liq < 1000 && t.holders < 1500 && t.maxRun < 20);
console.log(`Tokens with low liq (<$1k) and normal holders (<1500) but flat/failed: ${lowLiqLowHoldersFlat.length}`);
if (lowLiqLowHoldersFlat.length > 0) {
  console.log("Flat counter-example:", lowLiqLowHoldersFlat.map((t: any) => ({ symbol: t.symbol, liq: t.liq, holders: t.holders, maxRun: t.maxRun })));
}

// 6. Model A vs Model B Comparison
console.log("\n--- 6. MODEL A vs MODEL B COMPARISON ---");
// Events at dips (candle <= -3%)
const dipEvents = p4Events.filter((e: any) => e.candleChange <= -3);
console.log(`All dip events (candle <= -3%): N=${dipEvents.length}`);

// Model A: Buys immediately at T0 if Vol/Liq <= 100% and Prev15m < 100%
const modelA = dipEvents.filter((e: any) => e.volToLiq <= 100 && e.prev15mChange < 100);
const modelASuccess = modelA.filter((e: any) => e.max15 >= 15 && e.min15 > -20);
const modelAFail = modelA.filter((e: any) => e.min15 <= -25);

// Model B: Waits 1m for green confirmation (+1m > 0%)
const modelB = dipEvents.filter((e: any) => e.volToLiq <= 100 && e.prev15mChange < 100 && e.isNext1Green);
const modelBSuccess = modelB.filter((e: any) => e.max15 >= 15 && e.min15 > -20);
const modelBFail = modelB.filter((e: any) => e.min15 <= -25);

console.log(`Model A (T0 Only): Trades=${modelA.length}, Wins=${modelASuccess.length} (${(modelASuccess.length / (modelA.length || 1) * 100).toFixed(1)}%), Losses=${modelAFail.length} (${(modelAFail.length / (modelA.length || 1) * 100).toFixed(1)}%)`);
console.log(`Model B (T0 + 1m Conf): Trades=${modelB.length}, Wins=${modelBSuccess.length} (${(modelBSuccess.length / (modelB.length || 1) * 100).toFixed(1)}%), Losses=${modelBFail.length} (${(modelBFail.length / (modelB.length || 1) * 100).toFixed(1)}%)`);
