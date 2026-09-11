import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

interface GranularPoint {
  price: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  buyUsd: number;
  sellUsd: number;
  netFlow: number;
  buyerRatio: number;
  candleColor: 'GREEN' | 'RED' | 'DOJI';
}

interface ComprehensiveTokenAnalysis {
  address: string;
  symbol: string;
  name: string;
  launchpad: string;
  openTimestamp: number;
  t0_time_iso: string;
  poolAddress: string;
  exchange: string;
  totalSupply: number;
  t0_price: number;
  t0_mc: number;
  t0_liq: number;
  
  // Historical timeline points
  t_minus_5m?: GranularPoint;
  t_minus_2m?: GranularPoint;
  t_minus_1m?: GranularPoint;
  t0_point: GranularPoint;
  t_plus_30s?: GranularPoint;
  t_plus_1m?: GranularPoint;
  t_plus_2m?: GranularPoint;
  t_plus_3m?: GranularPoint;
  t_plus_5m?: GranularPoint;
  t_plus_10m?: GranularPoint;
  t_plus_15m?: GranularPoint;
  t_plus_30m?: GranularPoint;

  // Cumulative metrics at key early windows
  cum_30s_vol: number;
  cum_30s_net_flow: number;
  cum_30s_buyer_ratio: number;

  cum_1m_vol: number;
  cum_1m_net_flow: number;
  cum_1m_buyer_ratio: number;

  cum_2m_vol: number;
  cum_2m_net_flow: number;
  cum_2m_buyer_ratio: number;

  cum_3m_vol: number;
  cum_3m_net_flow: number;
  cum_3m_buyer_ratio: number;

  cum_5m_vol: number;
  cum_5m_net_flow: number;
  cum_5m_buyer_ratio: number;

  // Peak and final metrics
  maxHigh30m: number;
  maxGain30m: number;
  finalPrice30m: number;
  finalReturn30m: number;

  // Group classification
  isGroupA: boolean; // Sürdürülebilir yükseliş (finalReturn30m > 0%)
  pattern: 'A_SUSTAINED' | 'B_WICK_SPIKE' | 'C_SPIKE_THEN_DUMP' | 'D_CHOP' | 'E_DIRECT_DUMP';

  // Chain steps tracking
  chainSteps: {
    step1_migration_done: boolean;
    step2_early_buyer_volume: boolean; // 1m vol >= $100
    step3_buy_usd_increase: boolean; // 1m buyUsd >= $50
    step4_buy_exceeds_sell: boolean; // 1m buyUsd > sellUsd
    step5_positive_net_flow: boolean; // 1m netFlow > 0
    step6_high_buyer_ratio: boolean; // 1m buyerRatio >= 0.55
    step7_candle1_green: boolean; // 1m candle is GREEN
    step8_candle2_green: boolean; // 2m candle is GREEN
    step9_liq_maintained: boolean; // Liquidity at pool didn't dry up completely (t0_liq >= 1000)
    step10_mc_sustained_30m: boolean; // finalReturn30m > 0
  };

  // Snapshot metadata (annotated with look-ahead bias warning)
  snapshot_meta: {
    smartMoneyCount: number;
    kolCount: number;
    devStatus: string;
    devHoldRate: number;
    holderCount: number;
    hasLookAheadRisk: boolean;
  };
}

function runCli(args: string[]): any {
  const res = spawnSync('./node_modules/.bin/gmgn-cli', args, {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (res.error || res.status !== 0 || !res.stdout) {
    return null;
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    return null;
  }
}

function decomposeCandle(c: any): GranularPoint {
  const open = parseFloat(c.open || '0');
  const close = parseFloat(c.close || '0');
  const high = parseFloat(c.high || '0');
  const low = parseFloat(c.low || '0');
  const volume = parseFloat(c.volume || '0');

  let buyerRatio = 0.5;
  const range = high - low;
  if (range > 0.000000000001) {
    // Bulk volume / wick delta classification
    buyerRatio = (close - low) / range;
  } else if (close > open) {
    buyerRatio = 1.0;
  } else if (close < open) {
    buyerRatio = 0.0;
  }

  // Bound buyerRatio between 0 and 1
  buyerRatio = Math.max(0, Math.min(1, buyerRatio));
  const buyUsd = volume * buyerRatio;
  const sellUsd = volume * (1 - buyerRatio);
  const netFlow = buyUsd - sellUsd;

  let candleColor: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
  if (close > open * 1.002) candleColor = 'GREEN';
  else if (close < open * 0.998) candleColor = 'RED';

  return {
    price: close,
    open,
    close,
    high,
    low,
    volume,
    buyUsd,
    sellUsd,
    netFlow,
    buyerRatio,
    candleColor,
  };
}

async function main() {
  console.log('=== STARTING DEEP SUSTAINABLE MIGRATION ANALYSIS ===');
  
  // Read existing 88 events
  const raw = JSON.parse(fs.readFileSync('migration_analysis_results.json', 'utf8'));
  const events = raw.events || [];
  console.log(`Loaded ${events.length} migration events.`);

  const analyzedTokens: ComprehensiveTokenAnalysis[] = [];

  let count = 0;
  for (const ev of events) {
    count++;
    console.log(`[${count}/${events.length}] Analyzing ${ev.symbol} (${ev.address.slice(0, 10)}...)...`);

    // Fetch 1m klines
    const klines1mData = runCli(['market', 'kline', '--chain', 'robinhood', '--address', ev.address, '--resolution', '1m', '--raw']);
    const list1m: any[] = (klines1mData?.list || []).sort((a: any, b: any) => Number(a.time) - Number(b.time));

    // Fetch 30s klines
    const klines30sData = runCli(['market', 'kline', '--chain', 'robinhood', '--address', ev.address, '--resolution', '30s', '--raw']);
    const list30s: any[] = (klines30sData?.list || []).sort((a: any, b: any) => Number(a.time) - Number(b.time));

    const openMs = ev.openTimestamp * 1000;

    // Find T0 in 1m list
    let t0Idx1m = list1m.findIndex((c) => Math.abs(Number(c.time) - openMs) <= 90000);
    if (t0Idx1m === -1 && list1m.length > 0) {
      let minDiff = Infinity;
      list1m.forEach((c, i) => {
        const d = Math.abs(Number(c.time) - openMs);
        if (d < minDiff) {
          minDiff = d;
          t0Idx1m = i;
        }
      });
    }
    if (t0Idx1m === -1) t0Idx1m = 0;

    // Find T0 in 30s list
    let t0Idx30s = list30s.findIndex((c) => Math.abs(Number(c.time) - openMs) <= 45000);
    if (t0Idx30s === -1 && list30s.length > 0) {
      let minDiff = Infinity;
      list30s.forEach((c, i) => {
        const d = Math.abs(Number(c.time) - openMs);
        if (d < minDiff) {
          minDiff = d;
          t0Idx30s = i;
        }
      });
    }

    const t0Candle = list1m[t0Idx1m] || { open: ev.t0_price, close: ev.t0_price, high: ev.t0_price, low: ev.t0_price, volume: 0 };
    const t0Point = decomposeCandle(t0Candle);
    const t0Price = ev.t0_price || t0Point.close;

    // Timeline points relative to t0Idx1m
    const get1mPoint = (offset: number) => {
      const idx = t0Idx1m + offset;
      if (idx >= 0 && idx < list1m.length) {
        return decomposeCandle(list1m[idx]);
      }
      return undefined;
    };

    const t_minus_5m = get1mPoint(-5);
    const t_minus_2m = get1mPoint(-2);
    const t_minus_1m = get1mPoint(-1);
    const t_plus_1m = get1mPoint(1);
    const t_plus_2m = get1mPoint(2);
    const t_plus_3m = get1mPoint(3);
    const t_plus_5m = get1mPoint(5);
    const t_plus_10m = get1mPoint(10);
    const t_plus_15m = get1mPoint(15);
    const t_plus_30m = get1mPoint(30) || (list1m.length > t0Idx1m ? decomposeCandle(list1m[list1m.length - 1]) : undefined);

    // Timeline point for T+30s from 30s list
    let t_plus_30s: GranularPoint | undefined = undefined;
    if (t0Idx30s !== -1 && t0Idx30s + 1 < list30s.length) {
      t_plus_30s = decomposeCandle(list30s[t0Idx30s + 1]);
    } else if (t_plus_1m) {
      // Approximate 30s as half 1m
      t_plus_30s = {
        ...t_plus_1m,
        volume: t_plus_1m.volume * 0.5,
        buyUsd: t_plus_1m.buyUsd * 0.5,
        sellUsd: t_plus_1m.sellUsd * 0.5,
        netFlow: t_plus_1m.netFlow * 0.5,
      };
    }

    // Cumulative stats
    const pts1m = [t_plus_1m].filter((p): p is GranularPoint => !!p);
    const pts2m = [t_plus_1m, t_plus_2m].filter((p): p is GranularPoint => !!p);
    const pts3m = [t_plus_1m, t_plus_2m, t_plus_3m].filter((p): p is GranularPoint => !!p);
    const pts5m = [1, 2, 3, 4, 5].map(o => get1mPoint(o)).filter((p): p is GranularPoint => !!p);

    const calcCum = (pts: GranularPoint[]) => {
      const vol = pts.reduce((a, b) => a + b.volume, 0);
      const buy = pts.reduce((a, b) => a + b.buyUsd, 0);
      const net = pts.reduce((a, b) => a + b.netFlow, 0);
      const ratio = vol > 0 ? buy / vol : 0.5;
      return { vol, net, ratio };
    };

    const c30s = t_plus_30s ? { vol: t_plus_30s.volume, net: t_plus_30s.netFlow, ratio: t_plus_30s.buyerRatio } : { vol: 0, net: 0, ratio: 0.5 };
    const c1m = calcCum(pts1m);
    const c2m = calcCum(pts2m);
    const c3m = calcCum(pts3m);
    const c5m = calcCum(pts5m);

    // Max high and final price in 30m window
    const postWindow = list1m.slice(t0Idx1m + 1, Math.min(list1m.length, t0Idx1m + 31));
    let maxHigh = t0Price;
    postWindow.forEach(c => {
      const h = parseFloat(c.high || '0');
      if (h > maxHigh) maxHigh = h;
    });
    const maxGain30m = t0Price > 0 ? ((maxHigh - t0Price) / t0Price) * 100 : 0;
    const finalPrice = t_plus_30m ? t_plus_30m.close : (postWindow.length > 0 ? parseFloat(postWindow[postWindow.length - 1].close) : t0Price);
    const finalReturn30m = t0Price > 0 ? ((finalPrice - t0Price) / t0Price) * 100 : 0;

    // Group classification
    const isGroupA = finalReturn30m > 0;

    // 5 Specific Patterns:
    // A) Gerçek sürdürülebilir yükseliş: T+30m > 0 ve stabil
    // B) Kısa wick / spike: maxGain >= 25% ama T+5m veya T+10m'de hızla T0 altına inmiş, T+30m < 0
    // C) Spike sonrası hızlı dump: maxGain >= 50%, T+5m veya T+15m yüksek, ama T+30m'de çöküş (finalReturn <= -50%)
    // D) Yatay hareket: maxGain < 20% ve finalReturn between -20% and 0%
    // E) Doğrudan çöküş: İlk 1-2m kırmızı veya maxGain < 10% ve finalReturn < -20%
    let pattern: 'A_SUSTAINED' | 'B_WICK_SPIKE' | 'C_SPIKE_THEN_DUMP' | 'D_CHOP' | 'E_DIRECT_DUMP';
    if (isGroupA) {
      pattern = 'A_SUSTAINED';
    } else if (maxGain30m >= 50 && finalReturn30m <= -50) {
      pattern = 'C_SPIKE_THEN_DUMP';
    } else if (maxGain30m >= 25 && finalReturn30m < 0) {
      pattern = 'B_WICK_SPIKE';
    } else if (maxGain30m < 20 && finalReturn30m >= -25) {
      pattern = 'D_CHOP';
    } else {
      pattern = 'E_DIRECT_DUMP';
    }

    // Chain evaluation
    const step1 = true; // Migration done
    const step2 = c1m.vol >= 100; // Early buyer volume present
    const step3 = (t_plus_1m?.buyUsd || 0) >= 50; // Buy USD increase
    const step4 = (t_plus_1m?.buyUsd || 0) > (t_plus_1m?.sellUsd || 0); // Buy > Sell
    const step5 = c1m.net > 0; // Net flow positive
    const step6 = c1m.ratio >= 0.55; // Buyer ratio high
    const step7 = t_plus_1m?.candleColor === 'GREEN'; // C1 green
    const step8 = t_plus_2m?.candleColor === 'GREEN'; // C2 green
    const step9 = ev.t0_liq >= 1000; // Liq maintained
    const step10 = finalReturn30m > 0; // MC sustained at 30m

    const analyzed: ComprehensiveTokenAnalysis = {
      address: ev.address,
      symbol: ev.symbol,
      name: ev.name,
      launchpad: ev.launchpad,
      openTimestamp: ev.openTimestamp,
      t0_time_iso: ev.t0_time_iso,
      poolAddress: ev.poolAddress,
      exchange: ev.exchange,
      totalSupply: ev.t0_price > 0 ? Math.round(ev.t0_mc / ev.t0_price) : 1000000000,
      t0_price: t0Price,
      t0_mc: ev.t0_mc,
      t0_liq: ev.t0_liq,

      t_minus_5m,
      t_minus_2m,
      t_minus_1m,
      t0_point: t0Point,
      t_plus_30s,
      t_plus_1m,
      t_plus_2m,
      t_plus_3m,
      t_plus_5m,
      t_plus_10m,
      t_plus_15m,
      t_plus_30m,

      cum_30s_vol: c30s.vol,
      cum_30s_net_flow: c30s.net,
      cum_30s_buyer_ratio: c30s.ratio,

      cum_1m_vol: c1m.vol,
      cum_1m_net_flow: c1m.net,
      cum_1m_buyer_ratio: c1m.ratio,

      cum_2m_vol: c2m.vol,
      cum_2m_net_flow: c2m.net,
      cum_2m_buyer_ratio: c2m.ratio,

      cum_3m_vol: c3m.vol,
      cum_3m_net_flow: c3m.net,
      cum_3m_buyer_ratio: c3m.ratio,

      cum_5m_vol: c5m.vol,
      cum_5m_net_flow: c5m.net,
      cum_5m_buyer_ratio: c5m.ratio,

      maxHigh30m: maxHigh,
      maxGain30m,
      finalPrice30m: finalPrice,
      finalReturn30m,

      isGroupA,
      pattern,

      chainSteps: {
        step1_migration_done: step1,
        step2_early_buyer_volume: step2,
        step3_buy_usd_increase: step3,
        step4_buy_exceeds_sell: step4,
        step5_positive_net_flow: step5,
        step6_high_buyer_ratio: step6,
        step7_candle1_green: step7,
        step8_candle2_green: step8,
        step9_liq_maintained: step9,
        step10_mc_sustained_30m: step10,
      },

      snapshot_meta: {
        smartMoneyCount: ev.smartMoneyCount,
        kolCount: ev.kolCount,
        devStatus: ev.devStatus,
        devHoldRate: ev.devHoldRate,
        holderCount: ev.holderCount,
        hasLookAheadRisk: true,
      },
    };

    analyzedTokens.push(analyzed);
  }

  // Summary statistics
  const groupA = analyzedTokens.filter(t => t.isGroupA);
  const groupB = analyzedTokens.filter(t => !t.isGroupA);

  const patternCounts = {
    A_SUSTAINED: analyzedTokens.filter(t => t.pattern === 'A_SUSTAINED').length,
    B_WICK_SPIKE: analyzedTokens.filter(t => t.pattern === 'B_WICK_SPIKE').length,
    C_SPIKE_THEN_DUMP: analyzedTokens.filter(t => t.pattern === 'C_SPIKE_THEN_DUMP').length,
    D_CHOP: analyzedTokens.filter(t => t.pattern === 'D_CHOP').length,
    E_DIRECT_DUMP: analyzedTokens.filter(t => t.pattern === 'E_DIRECT_DUMP').length,
  };

  // Chain steps summary
  const total = analyzedTokens.length;
  const chainSummary = {
    step1: { count: total, pct: 100 },
    step2: { count: analyzedTokens.filter(t => t.chainSteps.step2_early_buyer_volume).length, pct: (analyzedTokens.filter(t => t.chainSteps.step2_early_buyer_volume).length / total) * 100 },
    step3: { count: analyzedTokens.filter(t => t.chainSteps.step3_buy_usd_increase).length, pct: (analyzedTokens.filter(t => t.chainSteps.step3_buy_usd_increase).length / total) * 100 },
    step4: { count: analyzedTokens.filter(t => t.chainSteps.step4_buy_exceeds_sell).length, pct: (analyzedTokens.filter(t => t.chainSteps.step4_buy_exceeds_sell).length / total) * 100 },
    step5: { count: analyzedTokens.filter(t => t.chainSteps.step5_positive_net_flow).length, pct: (analyzedTokens.filter(t => t.chainSteps.step5_positive_net_flow).length / total) * 100 },
    step6: { count: analyzedTokens.filter(t => t.chainSteps.step6_high_buyer_ratio).length, pct: (analyzedTokens.filter(t => t.chainSteps.step6_high_buyer_ratio).length / total) * 100 },
    step7: { count: analyzedTokens.filter(t => t.chainSteps.step7_candle1_green).length, pct: (analyzedTokens.filter(t => t.chainSteps.step7_candle1_green).length / total) * 100 },
    step8: { count: analyzedTokens.filter(t => t.chainSteps.step8_candle2_green).length, pct: (analyzedTokens.filter(t => t.chainSteps.step8_candle2_green).length / total) * 100 },
    step9: { count: analyzedTokens.filter(t => t.chainSteps.step9_liq_maintained).length, pct: (analyzedTokens.filter(t => t.chainSteps.step9_liq_maintained).length / total) * 100 },
    step10: { count: analyzedTokens.filter(t => t.chainSteps.step10_mc_sustained_30m).length, pct: (analyzedTokens.filter(t => t.chainSteps.step10_mc_sustained_30m).length / total) * 100 },
  };

  const output = {
    analyzedAt: new Date().toISOString(),
    totalTokens: total,
    groupACount: groupA.length,
    groupBCount: groupB.length,
    patternCounts,
    chainSummary,
    groupA_tokens: groupA.map(t => ({ symbol: t.symbol, address: t.address, finalReturn30m: t.finalReturn30m, maxGain30m: t.maxGain30m, t0_mc: t0_round(t.t0_mc), t0_liq: t0_round(t.t0_liq) })),
    tokens: analyzedTokens,
  };

  function t0_round(n: number) { return Math.round(n); }

  fs.writeFileSync('sustainable_migration_results.json', JSON.stringify(output, null, 2));
  console.log('\n=== ANALYSIS COMPLETE! Results saved to sustainable_migration_results.json ===');
  console.log('Group A (Sustained Win):', groupA.length);
  console.log('Group B (Exit Liq / Failed):', groupB.length);
  console.log('Patterns:', patternCounts);
}

main().catch(console.error);
