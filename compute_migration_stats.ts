import * as fs from 'node:fs';

interface MigrationEvent {
  address: string;
  symbol: string;
  name: string;
  launchpad: string;
  openTimestamp: number;
  migratedTimestamp: number;
  t0_time_iso: string;
  poolAddress: string;
  exchange: string;
  holderCount: number;
  top10HolderRate: number;
  smartMoneyCount: number;
  kolCount: number;
  devStatus: string;
  devHoldRate: number;
  t0_price: number;
  t0_mc: number;
  t0_liq: number;
  pre5m_price?: number;
  pre2m_price?: number;
  pre1m_price?: number;
  pre_vol5m?: number;
  pre_vol1m?: number;
  post1m_price?: number;
  post2m_price?: number;
  post5m_price?: number;
  post15m_price?: number;
  post30m_price?: number;
  post1m_vol?: number;
  post5m_vol?: number;
  post15m_vol?: number;
  candle1_color?: 'GREEN' | 'RED' | 'DOJI';
  candle2_color?: 'GREEN' | 'RED' | 'DOJI';
  firstTwoCandles?: string;
  maxGain30m: number;
  maxDrawdown30m: number;
  finalReturn30m: number;
  successChainOccurred: boolean;
  failureScenarioOccurred: boolean;
}

const data = JSON.parse(fs.readFileSync('migration_analysis_results.json', 'utf8'));
const events: MigrationEvent[] = data.events;

console.log(`=== ANALYZING ${events.length} REAL MIGRATION EVENTS ===`);

// 1. Overall Outcomes at T+30m
let countGain10 = 0;
let countGain25 = 0;
let countGain50 = 0;
let countGain100 = 0;

let countDrop10 = 0;
let countDrop25 = 0;
let countDrop50 = 0;
let countDrop90 = 0; // complete dump

events.forEach((e) => {
  if (e.maxGain30m >= 10) countGain10++;
  if (e.maxGain30m >= 25) countGain25++;
  if (e.maxGain30m >= 50) countGain50++;
  if (e.maxGain30m >= 100) countGain100++;

  if (e.finalReturn30m <= -10) countDrop10++;
  if (e.finalReturn30m <= -25) countDrop25++;
  if (e.finalReturn30m <= -50) countDrop50++;
  if (e.finalReturn30m <= -85) countDrop90++;
});

console.log('\n--- GAIN & DRAWDOWN STATS (within 30m) ---');
console.log(`Max Gain >= +10%: ${countGain10} / ${events.length} (${((countGain10 / events.length) * 100).toFixed(1)}%)`);
console.log(`Max Gain >= +25%: ${countGain25} / ${events.length} (${((countGain25 / events.length) * 100).toFixed(1)}%)`);
console.log(`Max Gain >= +50%: ${countGain50} / ${events.length} (${((countGain50 / events.length) * 100).toFixed(1)}%)`);
console.log(`Max Gain >= +100%: ${countGain100} / ${events.length} (${((countGain100 / events.length) * 100).toFixed(1)}%)`);

console.log(`Final Return <= -10%: ${countDrop10} / ${events.length} (${((countDrop10 / events.length) * 100).toFixed(1)}%)`);
console.log(`Final Return <= -25%: ${countDrop25} / ${events.length} (${((countDrop25 / events.length) * 100).toFixed(1)}%)`);
console.log(`Final Return <= -50%: ${countDrop50} / ${events.length} (${((countDrop50 / events.length) * 100).toFixed(1)}%)`);
console.log(`Final Return <= -85% (TOTAL COLLAPSE): ${countDrop90} / ${events.length} (${((countDrop90 / events.length) * 100).toFixed(1)}%)`);

// 2. Success Chain vs Failure Scenario
const successEvents = events.filter((e) => e.successChainOccurred);
const failureEvents = events.filter((e) => e.failureScenarioOccurred || e.finalReturn30m < -50);
const survivingWinners = events.filter((e) => e.finalReturn30m > 0);

console.log('\n--- SCENARIO ANALYSIS ---');
console.log(`Tokens with temporary run (Success chain occurred): ${successEvents.length} (${((successEvents.length / events.length) * 100).toFixed(1)}%)`);
console.log(`Tokens dumped/failed at T+30m: ${countDrop50} (${((countDrop50 / events.length) * 100).toFixed(1)}%)`);
console.log(`Tokens that STAYED positive at T+30m: ${survivingWinners.length} (${((survivingWinners.length / events.length) * 100).toFixed(1)}%)`);

// 3. Candle 1 behavior
const greenC1 = events.filter((e) => e.candle1_color === 'GREEN');
const redC1 = events.filter((e) => e.candle1_color === 'RED');
const dojiC1 = events.filter((e) => e.candle1_color === 'DOJI');

function calcStats(subset: MigrationEvent[]) {
  if (subset.length === 0) return { count: 0, meanMaxGain: 0, meanFinal: 0, winRate: 0 };
  const meanMaxGain = subset.reduce((a, b) => a + b.maxGain30m, 0) / subset.length;
  const meanFinal = subset.reduce((a, b) => a + b.finalReturn30m, 0) / subset.length;
  const wins = subset.filter((e) => e.finalReturn30m > 0).length;
  return {
    count: subset.length,
    meanMaxGain: Number(meanMaxGain.toFixed(1)),
    meanFinal: Number(meanFinal.toFixed(1)),
    winRate: Number(((wins / subset.length) * 100).toFixed(1)),
  };
}

console.log('\n--- CANDLE 1 BEHAVIOR ---');
console.log(`Candle 1 GREEN:`, calcStats(greenC1));
console.log(`Candle 1 RED:`, calcStats(redC1));
console.log(`Candle 1 DOJI/FLAT:`, calcStats(dojiC1));

// 4. First 2 candles
const gg = events.filter((e) => e.candle1_color === 'GREEN' && e.candle2_color === 'GREEN');
const rr = events.filter((e) => e.candle1_color === 'RED' && e.candle2_color === 'RED');
const rg = events.filter((e) => e.candle1_color === 'RED' && e.candle2_color === 'GREEN');
const gr = events.filter((e) => e.candle1_color === 'GREEN' && e.candle2_color === 'RED');

console.log('\n--- FIRST 2 CANDLES ---');
console.log(`GREEN -> GREEN:`, calcStats(gg));
console.log(`RED -> RED:`, calcStats(rr));
console.log(`RED -> GREEN:`, calcStats(rg));
console.log(`GREEN -> RED:`, calcStats(gr));

// 5. Groups A-H
const groupA = events.filter((e) => (e.post1m_vol || 0) < 50); // Migration + no new buyers / weak volume
const groupB = events.filter((e) => (e.post1m_vol || 0) >= 50); // Migration + new buyers arrived
const groupC = events.filter((e) => (e.post1m_vol || 0) >= 200 && e.candle1_color === 'GREEN'); // Migration + strong buy volume
const groupD = events.filter((e) => e.candle1_color === 'GREEN' && e.post1m_price! > e.t0_price); // Buyer ratio high / green candle
const groupE = events.filter((e) => e.smartMoneyCount > 0); // Smart Money present
const groupF = events.filter((e) => e.kolCount > 0); // KOL present
const groupG = events.filter((e) => e.smartMoneyCount > 0 && e.kolCount > 0); // Both present
const groupH = events.filter((e) => e.t0_liq < 1000 || (e.t0_liq < e.t0_mc * 0.05)); // Liquidity drained / not preserved

console.log('\n--- GROUPS A-H PERFORMANCE ---');
console.log('Group A (No buyers / low vol):', calcStats(groupA));
console.log('Group B (New buyers arrived / vol >= $50):', calcStats(groupB));
console.log('Group C (Strong buy vol >= $200 + Green):', calcStats(groupC));
console.log('Group D (Green C1 + price up):', calcStats(groupD));
console.log('Group E (Smart Money > 0):', calcStats(groupE));
console.log('Group F (KOL > 0):', calcStats(groupF));
console.log('Group G (Smart Money + KOL):', calcStats(groupG));
console.log('Group H (Liquidity drained < $1000):', calcStats(groupH));

// 6. Dev status comparison
const devClosed = events.filter((e) => e.devStatus.includes('close') || e.devHoldRate === 0);
const devHolding = events.filter((e) => !e.devStatus.includes('close') && e.devHoldRate > 0);
console.log('\n--- DEV SOLD VS HOLDING ---');
console.log('Dev Sold / Closed:', calcStats(devClosed));
console.log('Dev Still Holding:', calcStats(devHolding));

// 7. Successful Winners Examples & Collapsed Dump Examples
const topWinners = [...events].sort((a, b) => b.finalReturn30m - a.finalReturn30m).slice(0, 5);
const worstDumps = [...events].sort((a, b) => a.finalReturn30m - b.finalReturn30m).slice(0, 5);

console.log('\n--- TOP 5 SURVIVING WINNERS ---');
topWinners.forEach((t) => {
  console.log(`${t.symbol} (${t.address}): T0 MC=$${Math.round(t.t0_mc)}, Liq=$${Math.round(t.t0_liq)}, MaxGain=+${t.maxGain30m.toFixed(1)}%, 30m Return=+${t.finalReturn30m.toFixed(1)}%, C1=${t.candle1_color}, SM=${t.smartMoneyCount}, KOL=${t.kolCount}`);
});

console.log('\n--- TOP 5 WORST CRASHES/DUMPS ---');
worstDumps.forEach((t) => {
  console.log(`${t.symbol} (${t.address}): T0 MC=$${Math.round(t.t0_mc)}, Liq=$${Math.round(t.t0_liq)}, MaxGain=+${t.maxGain30m.toFixed(1)}%, 30m Return=${t.finalReturn30m.toFixed(1)}%, C1=${t.candle1_color}, SM=${t.smartMoneyCount}, KOL=${t.kolCount}`);
});

// Save complete summary
fs.writeFileSync(
  'migration_stats_summary.json',
  JSON.stringify(
    {
      totalEvents: events.length,
      gainStats: { countGain10, countGain25, countGain50, countGain100 },
      dropStats: { countDrop10, countDrop25, countDrop50, countDrop90 },
      candle1Stats: {
        green: calcStats(greenC1),
        red: calcStats(redC1),
        doji: calcStats(dojiC1),
      },
      twoCandleStats: {
        greenGreen: calcStats(gg),
        redRed: calcStats(rr),
        redGreen: calcStats(rg),
        greenRed: calcStats(gr),
      },
      groups: {
        A: calcStats(groupA),
        B: calcStats(groupB),
        C: calcStats(groupC),
        D: calcStats(groupD),
        E: calcStats(groupE),
        F: calcStats(groupF),
        G: calcStats(groupG),
        H: calcStats(groupH),
      },
      devStats: {
        devClosed: calcStats(devClosed),
        devHolding: calcStats(devHolding),
      },
      topWinners,
      worstDumps,
    },
    null,
    2
  )
);
console.log('\nSaved to migration_stats_summary.json');
