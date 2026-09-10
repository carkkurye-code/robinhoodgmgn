import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";

const bin = path.resolve("./node_modules/.bin/gmgn-cli");

function sleep(ms: number) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function runCmd(args: string[]): any {
  console.log(`[QUERY] gmgn-cli ${args.join(" ")}`);
  const res = spawnSync(bin, args, { encoding: "utf8" });
  sleep(1500); // 1.5s delay to strictly avoid GMGN rate limits
  if (!res.stdout) {
    return null;
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    return null;
  }
}

async function collectPhase3Data() {
  console.log("=== PHASE 3 DATA COLLECTION: HUNTER VS PREY ===");

  // 1. Fetch SM & KOL tracking records
  const smRes = runCmd(["track", "smartmoney", "--chain", "robinhood", "--raw"]);
  const kolRes = runCmd(["track", "kol", "--chain", "robinhood", "--raw"]);

  const smTrades = smRes?.list || [];
  const kolTrades = kolRes?.list || [];
  console.log(`SM trades: ${smTrades.length} | KOL trades: ${kolTrades.length}`);

  // 2. Fetch Trenches (new creation, near completion, completed) to capture early tokens, rugs, and pre-runners
  const trenchesRes = runCmd(["market", "trenches", "--chain", "robinhood", "--raw"]);
  const trenchesList = trenchesRes?.data?.list || trenchesRes?.list || [];
  console.log(`Trenches items: ${trenchesList.length}`);

  // 3. Fetch Trending across 5m, 1h, 24h
  const trend5m = runCmd(["market", "trending", "--chain", "robinhood", "--interval", "5m", "--limit", "25", "--raw"]);
  const trend1h = runCmd(["market", "trending", "--chain", "robinhood", "--interval", "1h", "--limit", "30", "--raw"]);
  const trend24h = runCmd(["market", "trending", "--chain", "robinhood", "--interval", "24h", "--limit", "30", "--raw"]);

  const tokenMap = new Map<string, any>();

  for (const t of [...(trend5m?.data?.rank || []), ...(trend1h?.data?.rank || []), ...(trend24h?.data?.rank || [])]) {
    if (t.address && !tokenMap.has(t.address.toLowerCase())) {
      tokenMap.set(t.address.toLowerCase(), {
        address: t.address,
        symbol: t.symbol,
        source: "trending",
        market_cap: t.market_cap,
        liquidity: t.liquidity,
        swaps: t.swaps,
        buys: t.buys,
        sells: t.sells,
        priceChange1m: t.price_change_percent1m,
        priceChange5m: t.price_change_percent5m,
        priceChange1h: t.price_change_percent1h,
      });
    }
  }

  for (const t of trenchesList) {
    const addr = (t.address || t.token_address || "").toLowerCase();
    if (addr && !tokenMap.has(addr)) {
      tokenMap.set(addr, {
        address: t.address || t.token_address,
        symbol: t.symbol,
        source: "trenches",
        market_cap: t.market_cap,
        liquidity: t.liquidity,
        creator: t.creator,
        bundlerRate: t.bundler_trader_amount_rate,
        sniperRate: t.top70_sniper_hold_rate,
        ratTraderRate: t.rat_trader_amount_rate,
        devHoldRate: t.dev_team_hold_rate,
        holderCount: t.holder_count,
        launchpad: t.launchpad,
      });
    }
  }

  for (const t of [...smTrades, ...kolTrades]) {
    const addr = (t.base_address || "").toLowerCase();
    if (addr && !tokenMap.has(addr)) {
      tokenMap.set(addr, {
        address: t.base_address,
        symbol: t.base_token?.symbol || "UNKNOWN",
        source: "social_track",
        market_cap: 0,
        liquidity: 0,
      });
    }
  }

  console.log(`Unique candidate tokens collected: ${tokenMap.size}`);

  // Select 25 tokens covering:
  // - Top runners: imdbot, RocketFrog, INFINITE, BZZZ, NET, Startup, PWH
  // - Severe drops / rugs / failures: STONKFLY, HOPPY, ORVIA, DUO, CME, RSTR, CASTPAD, HIGHER, SHELL
  // - Slow accumulation / consolidation / trenches creations: MARIO, SHROOM, FLY, MIRROR, 500, lemoncat, rawr, Agent Hood
  const sampleAddresses = Array.from(tokenMap.keys()).slice(0, 25);

  const now = Math.floor(Date.now() / 1000);
  const from = now - 3600 * 4; // past 4 hours of 1m candles

  const tokenDataList: any[] = [];

  for (const addr of sampleAddresses) {
    const meta = tokenMap.get(addr);
    console.log(`Querying ${meta?.symbol || addr} (${addr})...`);

    const infoRes = runCmd(["token", "info", "--chain", "robinhood", "--address", addr, "--raw"]);
    const secRes = runCmd(["token", "security", "--chain", "robinhood", "--address", addr, "--raw"]);
    const klineRes = runCmd(["market", "kline", "--chain", "robinhood", "--address", addr, "--resolution", "1m", "--from", String(from), "--to", String(now), "--raw"]);

    const info = infoRes?.data || {};
    const sec = secRes?.data || {};
    const klines = klineRes?.list || [];

    tokenDataList.push({
      address: addr,
      symbol: info.symbol || meta.symbol,
      meta,
      info,
      sec,
      klinesCount: klines.length,
      klines,
    });
  }

  const payload = {
    timestamp: Date.now(),
    smTrades,
    kolTrades,
    tokenDataList,
  };

  fs.writeFileSync("./phase3_raw_data.json", JSON.stringify(payload, null, 2));
  console.log("Phase 3 data collection finished! Saved to phase3_raw_data.json");
}

collectPhase3Data().catch(console.error);
