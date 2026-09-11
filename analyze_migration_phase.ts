import { spawnSync } from 'node:child_process';
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
  // Stats
  holderCount: number;
  top10HolderRate: number;
  smartMoneyCount: number;
  kolCount: number;
  devStatus: string;
  devHoldRate: number;
  // Prices & Market Cap
  t0_price: number;
  t0_mc: number;
  t0_liq: number;
  // Pre-migration candles (T-5, T-2, T-1)
  pre5m_price?: number;
  pre2m_price?: number;
  pre1m_price?: number;
  pre_vol5m?: number;
  pre_vol1m?: number;
  // Post-migration candles (T+1m, T+2m, T+5m, T+15m, T+30m)
  post1m_price?: number;
  post2m_price?: number;
  post5m_price?: number;
  post15m_price?: number;
  post30m_price?: number;
  post1m_vol?: number;
  post5m_vol?: number;
  post15m_vol?: number;
  // Candle colors
  candle1_color?: 'GREEN' | 'RED' | 'DOJI';
  candle2_color?: 'GREEN' | 'RED' | 'DOJI';
  firstTwoCandles?: string;
  // Max gain / max drawdown within 30m
  maxGain30m: number;
  maxDrawdown30m: number;
  finalReturn30m: number;
  postLiqEstimated?: number;
  successChainOccurred: boolean; // Migration -> New Buyers -> Buy USD > Sell USD -> 1m candle green -> MC increases
  failureScenarioOccurred: boolean; // Migration -> Sell pressure / no buyers -> Liq drop -> MC drop
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

async function main() {
  console.log('=== GMGN ROBINHOOD MIGRATION RESEARCH COLLECTOR ===');

  // 1. Fetch completed trenches tokens
  console.log('Fetching completed tokens from trenches...');
  const trenchesData = runCli(['market', 'trenches', '--chain', 'robinhood', '--type', 'completed', '--limit', '80', '--raw']);
  const completedList = trenchesData?.completed || [];
  console.log(`Found ${completedList.length} completed tokens from trenches.`);

  // 2. Also check phase 4 tokens
  const p4Path = 'phase4_analyzed_events.json';
  let p4Tokens: any[] = [];
  if (fs.existsSync(p4Path)) {
    const p4 = JSON.parse(fs.readFileSync(p4Path, 'utf8'));
    p4Tokens = p4.tokenSummaries || [];
    console.log(`Found ${p4Tokens.length} tokens from phase 4.`);
  }

  // Combine unique token addresses
  const allMap = new Map<string, any>();
  for (const t of completedList) {
    if (t.address) allMap.set(t.address.toLowerCase(), t);
  }
  for (const t of p4Tokens) {
    if (t.address && !allMap.has(t.address.toLowerCase())) {
      allMap.set(t.address.toLowerCase(), t);
    }
  }

  console.log(`Total candidate tokens: ${allMap.size}`);

  const migrationEvents: MigrationEvent[] = [];
  const nonMigratedTokens: any[] = [];

  let idx = 0;
  for (const [address, baseObj] of allMap.entries()) {
    idx++;
    console.log(`[${idx}/${allMap.size}] Processing ${baseObj.symbol || address}...`);

    // Fetch token info
    const info = runCli(['token', 'info', '--chain', 'robinhood', '--address', address, '--raw']);
    if (!info) {
      console.log(`  Failed to fetch info for ${address}`);
      continue;
    }

    const openTs = info.open_timestamp || info.migrated_timestamp || baseObj.open_timestamp || 0;
    const isCompleted = info.launchpad_status === 1 || info.launchpad_progress === 1 || openTs > 0;

    if (!isCompleted || openTs === 0) {
      nonMigratedTokens.push({
        address,
        symbol: info.symbol || baseObj.symbol,
        launchpad: info.launchpad,
        launchpad_status: info.launchpad_status,
        launchpad_progress: info.launchpad_progress,
        open_timestamp: openTs,
        mc: info.market_cap || info.usd_market_cap || baseObj.mc,
        liq: info.liquidity || baseObj.liq,
      });
      continue;
    }

    // Fetch 1m Klines
    const klinesData = runCli(['market', 'kline', '--chain', 'robinhood', '--address', address, '--resolution', '1m', '--raw']);
    const rawKlines: any[] = klinesData?.list || [];

    if (rawKlines.length === 0) {
      console.log(`  No klines for ${info.symbol}`);
      continue;
    }

    // Sort klines by time asc
    const klines = rawKlines.sort((a, b) => Number(a.time) - Number(b.time));

    // Find T0 candle index
    // openTs is in seconds, candle time is in ms
    const openMs = openTs * 1000;
    let t0Idx = klines.findIndex((c) => Math.abs(Number(c.time) - openMs) <= 90000);
    if (t0Idx === -1) {
      // Find closest candle to openMs
      let minDiff = Infinity;
      klines.forEach((c, i) => {
        const diff = Math.abs(Number(c.time) - openMs);
        if (diff < minDiff) {
          minDiff = diff;
          t0Idx = i;
        }
      });
    }

    if (t0Idx === -1 || t0Idx >= klines.length) {
      t0Idx = 0;
    }

    const t0Candle = klines[t0Idx];
    const t0Price = parseFloat(t0Candle.close || t0Candle.open);
    const totalSupply = parseFloat(info.total_supply || '1000000000');
    const t0Mc = t0Price * totalSupply;
    const t0Liq = parseFloat(info.liquidity || baseObj.liq || '1000');

    // Pre-migration prices
    const pre1mIdx = t0Idx - 1 >= 0 ? t0Idx - 1 : null;
    const pre2mIdx = t0Idx - 2 >= 0 ? t0Idx - 2 : null;
    const pre5mIdx = t0Idx - 5 >= 0 ? t0Idx - 5 : null;

    const pre1mPrice = pre1mIdx !== null ? parseFloat(klines[pre1mIdx].close) : undefined;
    const pre2mPrice = pre2mIdx !== null ? parseFloat(klines[pre2mIdx].close) : undefined;
    const pre5mPrice = pre5mIdx !== null ? parseFloat(klines[pre5mIdx].close) : undefined;

    const preVol1m = pre1mIdx !== null ? parseFloat(klines[pre1mIdx].volume || '0') : undefined;
    const preVol5m = pre5mIdx !== null ? klines.slice(pre5mIdx, t0Idx).reduce((acc, c) => acc + parseFloat(c.volume || '0'), 0) : undefined;

    // Post-migration prices
    const post1mIdx = t0Idx + 1 < klines.length ? t0Idx + 1 : null;
    const post2mIdx = t0Idx + 2 < klines.length ? t0Idx + 2 : null;
    const post5mIdx = t0Idx + 5 < klines.length ? t0Idx + 5 : null;
    const post15mIdx = t0Idx + 15 < klines.length ? t0Idx + 15 : null;
    const post30mIdx = t0Idx + 30 < klines.length ? t0Idx + 30 : (klines.length - 1 > t0Idx ? klines.length - 1 : null);

    const post1mPrice = post1mIdx !== null ? parseFloat(klines[post1mIdx].close) : undefined;
    const post2mPrice = post2mIdx !== null ? parseFloat(klines[post2mIdx].close) : undefined;
    const post5mPrice = post5mIdx !== null ? parseFloat(klines[post5mIdx].close) : undefined;
    const post15mPrice = post15mIdx !== null ? parseFloat(klines[post15mIdx].close) : undefined;
    const post30mPrice = post30mIdx !== null ? parseFloat(klines[post30mIdx].close) : undefined;

    const post1mVol = post1mIdx !== null ? parseFloat(klines[post1mIdx].volume || '0') : undefined;
    const post5mVol = post5mIdx !== null ? klines.slice(t0Idx + 1, post5mIdx + 1).reduce((acc, c) => acc + parseFloat(c.volume || '0'), 0) : undefined;
    const post15mVol = post15mIdx !== null ? klines.slice(t0Idx + 1, post15mIdx + 1).reduce((acc, c) => acc + parseFloat(c.volume || '0'), 0) : undefined;

    // Candle 1 & 2 colors
    let c1Color: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
    if (post1mIdx !== null) {
      const c = klines[post1mIdx];
      const open = parseFloat(c.open);
      const close = parseFloat(c.close);
      if (close > open * 1.002) c1Color = 'GREEN';
      else if (close < open * 0.998) c1Color = 'RED';
    }

    let c2Color: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
    if (post2mIdx !== null) {
      const c = klines[post2mIdx];
      const open = parseFloat(c.open);
      const close = parseFloat(c.close);
      if (close > open * 1.002) c2Color = 'GREEN';
      else if (close < open * 0.998) c2Color = 'RED';
    }

    // Max gain / drawdown within 30m window
    const postWindow = klines.slice(t0Idx + 1, Math.min(klines.length, t0Idx + 31));
    let maxPrice = t0Price;
    let minPrice = t0Price;
    postWindow.forEach((c) => {
      const h = parseFloat(c.high);
      const l = parseFloat(c.low);
      if (h > maxPrice) maxPrice = h;
      if (l < minPrice) minPrice = l;
    });

    const maxGain30m = t0Price > 0 ? ((maxPrice - t0Price) / t0Price) * 100 : 0;
    const maxDrawdown30m = t0Price > 0 ? ((minPrice - t0Price) / t0Price) * 100 : 0;
    const finalPrice = post30mPrice || (postWindow.length > 0 ? parseFloat(postWindow[postWindow.length - 1].close) : t0Price);
    const finalReturn30m = t0Price > 0 ? ((finalPrice - t0Price) / t0Price) * 100 : 0;

    // Chain evaluation
    // Success chain: Post1m price > T0, Post5m price > T0, gain > 10%
    const successChain = (post1mPrice !== undefined && post1mPrice > t0Price) && (post5mPrice !== undefined && post5mPrice > t0Price) && maxGain30m >= 10;
    // Failure chain: Post1m price < T0, Post5m price < T0, return < -10% or finalReturn30m < -20%
    const failureScenario = (post1mPrice !== undefined && post1mPrice < t0Price) && (post5mPrice !== undefined && post5mPrice < t0Price || finalReturn30m <= -10);

    const event: MigrationEvent = {
      address,
      symbol: info.symbol || baseObj.symbol || 'UNKNOWN',
      name: info.name || baseObj.name || '',
      launchpad: info.launchpad || baseObj.launchpad || 'pons',
      openTimestamp: openTs,
      migratedTimestamp: info.migrated_timestamp || openTs,
      t0_time_iso: new Date(openTs * 1000).toISOString(),
      poolAddress: info.migrated_pool || info.pool?.pool_address || baseObj.pool_address || '',
      exchange: info.pool?.exchange || 'uniswap_v3',
      holderCount: info.holder_count || info.stat?.holder_count || 0,
      top10HolderRate: parseFloat(info.stat?.top_10_holder_rate || info.top_10_holder_rate || '0'),
      smartMoneyCount: info.stat?.smart_degen_count || info.wallet_tags_stat?.smart_wallets || 0,
      kolCount: info.wallet_tags_stat?.renowned_wallets || 0,
      devStatus: info.dev?.creator_token_status || 'unknown',
      devHoldRate: parseFloat(info.stat?.creator_hold_rate || '0'),
      t0_price: t0Price,
      t0_mc: t0Mc,
      t0_liq: t0Liq,
      pre5m_price: pre5mPrice,
      pre2m_price: pre2mPrice,
      pre1m_price: pre1mPrice,
      pre_vol5m: preVol5m,
      pre_vol1m: preVol1m,
      post1m_price: post1mPrice,
      post2m_price: post2mPrice,
      post5m_price: post5mPrice,
      post15m_price: post15mPrice,
      post30m_price: post30mPrice,
      post1m_vol: post1mVol,
      post5m_vol: post5mVol,
      post15m_vol: post15mVol,
      candle1_color: c1Color,
      candle2_color: c2Color,
      firstTwoCandles: `${c1Color}_${c2Color}`,
      maxGain30m,
      maxDrawdown30m,
      finalReturn30m,
      successChainOccurred: successChain,
      failureScenarioOccurred: failureScenario,
    };

    migrationEvents.push(event);
    console.log(`  -> ${event.symbol}: T0 MC=$${Math.round(event.t0_mc)}, 30m Return=${event.finalReturn30m.toFixed(1)}%, MaxGain=${event.maxGain30m.toFixed(1)}%, Chain=${event.successChainOccurred ? 'SUCCESS' : (event.failureScenarioOccurred ? 'DUMP' : 'CHOP')}`);
  }

  // Save results
  const out = {
    totalEvents: migrationEvents.length,
    events: migrationEvents,
    nonMigratedCount: nonMigratedTokens.length,
    nonMigratedTokens,
  };

  fs.writeFileSync('migration_analysis_results.json', JSON.stringify(out, null, 2));
  console.log(`\nDONE! Processed ${migrationEvents.length} migration events. Saved to migration_analysis_results.json`);
}

main().catch(console.error);
