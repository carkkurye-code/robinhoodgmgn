import { spawnSync } from "child_process";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const bin = "./node_modules/.bin/gmgn-cli";
const OUT_FILE = "./phase4_raw_data.json";

function sleep(ms: number) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function getCli(args: string[], maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 6000 });
    const stdout = (res.stdout || "").trim();
    if (!stdout) {
      sleep(800);
      continue;
    }
    try {
      const parsed = JSON.parse(stdout);
      if (parsed && parsed.code !== undefined && parsed.code !== 0 && parsed.code !== "0") {
        sleep(800);
        continue;
      }
      sleep(600);
      return parsed;
    } catch {
      sleep(600);
    }
  }
  return null;
}

async function main() {
  console.log("=== PHASE 4: OUT-OF-SAMPLE DATA COLLECTION ===");

  const p3Raw = JSON.parse(fs.readFileSync("./phase3_raw_data.json", "utf8"));
  const p3Addrs = new Set(p3Raw.tokenDataList.map((t: any) => t.address.toLowerCase()));

  console.log("Phase 3 tokens excluded:", p3Addrs.size);

  // 1. Discover New Tokens
  const completed = getCli(["market", "trenches", "--chain", "robinhood", "--type", "completed", "--limit", "80", "--raw"]);
  const trending1h = getCli(["market", "trending", "--chain", "robinhood", "--interval", "1h", "--raw"]);
  const trending4h = getCli(["market", "trending", "--chain", "robinhood", "--interval", "4h", "--raw"]);
  const trending24h = getCli(["market", "trending", "--chain", "robinhood", "--interval", "24h", "--raw"]);

  const allNew = new Map<string, any>();
  function addList(list: any[]) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const a = (item.address || "").toLowerCase();
      if (!a || p3Addrs.has(a)) continue;
      if (!allNew.has(a)) allNew.set(a, item);
    }
  }

  if (completed?.completed) addList(completed.completed);
  if (trending1h?.data) addList(trending1h.data);
  if (trending4h?.data) addList(trending4h.data);
  if (trending24h?.data) addList(trending24h.data);

  console.log(`Discovered ${allNew.size} candidate out-of-sample tokens.`);

  // 2. Fetch Klines, Security, and Info for top candidates
  const candidates = [...allNew.values()].slice(0, 28);
  const tokenDataList: any[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const addr = c.address;
    console.log(`[${i + 1}/${candidates.length}] Fetching data for ${c.symbol} (${addr})...`);

    // Klines
    const klinesRes = getCli(["market", "kline", "--chain", "robinhood", "--address", addr, "--resolution", "1m", "--raw"]);
    const klines = klinesRes?.data?.list || klinesRes?.list || [];

    // Security
    const secRes = getCli(["token", "security", "--chain", "robinhood", "--address", addr, "--raw"]);
    const sec = secRes?.data || secRes || {};

    // Info
    const infoRes = getCli(["token", "info", "--chain", "robinhood", "--address", addr, "--raw"]);
    const info = infoRes?.data || infoRes || {};

    tokenDataList.push({
      symbol: c.symbol,
      name: c.name,
      address: addr,
      meta: c,
      info,
      sec,
      klines,
      klinesCount: klines.length
    });

    // Incremental checkpoint save
    fs.writeFileSync(OUT_FILE, JSON.stringify({
      phase: 4,
      collectedAt: new Date().toISOString(),
      tokensCount: tokenDataList.length,
      tokenDataList,
      smTrades: [],
      kolTrades: []
    }, null, 2));
  }

  // 3. Fetch fresh tracking data (KOL and SM)
  console.log("Fetching latest KOL and SM trades...");
  const smRes = getCli(["track", "smart-money", "--chain", "robinhood", "--limit", "100", "--raw"]);
  const kolRes = getCli(["track", "kol", "--chain", "robinhood", "--limit", "100", "--raw"]);

  const smTrades = smRes?.data?.history || smRes?.data?.list || smRes?.history || [];
  const kolTrades = kolRes?.data?.history || kolRes?.data?.list || kolRes?.history || [];

  const payload = {
    phase: 4,
    collectedAt: new Date().toISOString(),
    totalCandidatesDiscovered: allNew.size,
    tokensCount: tokenDataList.length,
    smTradesCount: smTrades.length,
    kolTradesCount: kolTrades.length,
    tokenDataList,
    smTrades,
    kolTrades
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Successfully saved Phase 4 raw dataset to ${OUT_FILE}`);
}

main().catch(console.error);
