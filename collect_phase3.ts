import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const bin = path.resolve("./node_modules/.bin/gmgn-cli");
const DATA_FILE = "./phase3_raw_data.json";

function sleep(ms: number) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function runCmd(args: string[], maxRetries = 3): any {
  // Never log API key or credentials
  const cmdDisplay = args.join(" ");
  console.log(`[QUERY] gmgn-cli ${cmdDisplay}`);

  const apiKey = process.env.GMGN_API_KEY || "";
  const envConfig: NodeJS.ProcessEnv = {
    ...process.env,
    ...(apiKey ? { GMGN_API_KEY: apiKey } : {}),
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = spawnSync(bin, args, {
      encoding: "utf8",
      env: envConfig,
      maxBuffer: 20 * 1024 * 1024,
    });

    const stdout = res.stdout || "";
    const stderr = res.stderr || "";

    // Check for rate limits or quota exceeded in output
    const isRateLimited =
      res.status !== 0 &&
      (stderr.includes("429") ||
        stderr.includes("quota") ||
        stderr.includes("rate limit") ||
        stdout.includes("429") ||
        stdout.includes("quota") ||
        stdout.includes("rate limit"));

    if (isRateLimited && attempt < maxRetries) {
      const waitTime = 3000 * Math.pow(2, attempt);
      console.warn(`[RATE LIMIT / QUOTA] Deneme ${attempt + 1}/${maxRetries} başarısız. ${waitTime}ms bekleniyor...`);
      sleep(waitTime);
      continue;
    }

    // Normal delay between successful or non-retry calls
    sleep(1800);

    if (!stdout.trim()) {
      if (attempt < maxRetries) {
        sleep(2000);
        continue;
      }
      return null;
    }

    try {
      const parsed = JSON.parse(stdout);
      // Check if CLI returned an error payload
      if (parsed && typeof parsed === "object") {
        if (parsed.code !== undefined && parsed.code !== 0 && parsed.code !== "0") {
          console.warn(`[GMGN ERROR CODE] ${cmdDisplay} -> code: ${parsed.code}, msg: ${parsed.msg || parsed.message}`);
          if (attempt < maxRetries) {
            sleep(2500);
            continue;
          }
          return null;
        }
      }
      return parsed;
    } catch {
      if (attempt < maxRetries) {
        sleep(2000);
        continue;
      }
      return null;
    }
  }

  return null;
}

async function collectPhase3Data() {
  console.log("=== PHASE 3 DATA COLLECTION: HUNTER VS PREY ===");

  // 1. Check existing checkpoint file
  let existingPayload: any = null;
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, "utf8");
      existingPayload = JSON.parse(content);
      console.log(`[CHECKPOINT] Mevcut ${DATA_FILE} okundu.`);
      console.log(`  - SM Trades: ${existingPayload.smTrades?.length || 0}`);
      console.log(`  - KOL Trades: ${existingPayload.kolTrades?.length || 0}`);
      console.log(`  - Token Data Listesi: ${existingPayload.tokenDataList?.length || 0} adet token.`);
    } catch (err) {
      console.warn("[CHECKPOINT] Mevcut dosya okuma uyarısı:", err);
    }
  }

  // Preserve or fetch SM & KOL
  let smTrades = existingPayload?.smTrades || [];
  let kolTrades = existingPayload?.kolTrades || [];

  if (smTrades.length === 0) {
    console.log("[DATA] Smart Money işlemleri çekiliyor...");
    const smRes = runCmd(["track", "smartmoney", "--chain", "robinhood", "--raw"]);
    smTrades = smRes?.list || [];
  } else {
    console.log(`[PRESERVED] ${smTrades.length} adet mevcut Smart Money işlemi korundu.`);
  }

  if (kolTrades.length === 0) {
    console.log("[DATA] KOL işlemleri çekiliyor...");
    const kolRes = runCmd(["track", "kol", "--chain", "robinhood", "--raw"]);
    kolTrades = kolRes?.list || [];
  } else {
    console.log(`[PRESERVED] ${kolTrades.length} adet mevcut KOL işlemi korundu.`);
  }

  // Token list initialization from checkpoint if available
  let tokenDataList: any[] = existingPayload?.tokenDataList || [];

  // If no existing token list, discover candidates from trenches & trending
  if (tokenDataList.length === 0) {
    console.log("[DATA] Aday token listesi keşfediliyor (trenches & trending)...");
    const trenchesRes = runCmd(["market", "trenches", "--chain", "robinhood", "--raw"]);
    const trenchesList = trenchesRes?.data?.list || trenchesRes?.list || [];

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

    const sampleAddresses = Array.from(tokenMap.keys()).slice(0, 25);
    for (const addr of sampleAddresses) {
      const meta = tokenMap.get(addr);
      tokenDataList.push({
        address: addr,
        symbol: meta?.symbol || "UNKNOWN",
        meta,
        info: {},
        sec: {},
        klinesCount: 0,
        klines: [],
      });
    }
  } else {
    console.log(`[PRESERVED] Mevcut 25 token havuzu aynen korundu.`);
  }

  // Resume processing for each token in tokenDataList
  const now = Math.floor(Date.now() / 1000);
  const from = now - 3600 * 4;

  let updatedInfoCount = 0;
  let updatedSecCount = 0;
  let preservedKlinesCount = 0;

  for (let idx = 0; idx < tokenDataList.length; idx++) {
    const item = tokenDataList[idx];
    const addr = (item.address || "").toLowerCase();
    const sym = item.symbol || item.meta?.symbol || addr.slice(0, 8);

    console.log(`\n--- [${idx + 1}/${tokenDataList.length}] İNCELENİYOR: ${sym} (${addr}) ---`);

    // 1. Check Info
    const hasValidInfo =
      item.info &&
      typeof item.info === "object" &&
      Object.keys(item.info).length > 0 &&
      (item.info.holder_count !== undefined || item.info.symbol !== undefined || item.info.address !== undefined);

    if (hasValidInfo) {
      console.log(`  [INFO] Zaten mevcut ve dolu (${item.info.holder_count || 0} holder). Tekrar çekilmiyor.`);
    } else {
      console.log(`  [INFO EKSİK] GMGN token info sorgulanıyor...`);
      const infoRes = runCmd(["token", "info", "--chain", "robinhood", "--address", addr, "--raw"]);
      const rawInfo = infoRes?.data || infoRes;

      if (rawInfo && typeof rawInfo === "object" && (rawInfo.address || rawInfo.symbol || rawInfo.holder_count !== undefined)) {
        const stat = rawInfo.stat || {};
        item.info = {
          ...rawInfo,
          // Map stat fields for seamless analyze_phase3.ts consumption while preserving raw GMGN payload
          top_10_holder_rate: stat.top_10_holder_rate !== undefined ? stat.top_10_holder_rate : rawInfo.top_10_holder_rate,
          dev_team_hold_rate: stat.dev_team_hold_rate !== undefined ? stat.dev_team_hold_rate : rawInfo.dev_team_hold_rate,
          top70_sniper_hold_rate: stat.top70_sniper_hold_rate !== undefined ? stat.top70_sniper_hold_rate : rawInfo.top70_sniper_hold_rate,
          top_bundler_trader_percentage: stat.top_bundler_trader_percentage !== undefined ? stat.top_bundler_trader_percentage : rawInfo.top_bundler_trader_percentage,
        };
        if (rawInfo.symbol && (!item.symbol || item.symbol === "UNKNOWN")) {
          item.symbol = rawInfo.symbol;
        }
        updatedInfoCount++;
        console.log(`  [INFO BAŞARILI] Holder: ${item.info.holder_count}, Liq: $${Number(item.info.liquidity || 0).toFixed(0)}`);
      } else {
        console.warn(`  [INFO BAŞARISIZ] ${sym} için token info alınamadı.`);
      }
    }

    // 2. Check Security
    const hasValidSec =
      item.sec &&
      typeof item.sec === "object" &&
      Object.keys(item.sec).length > 0 &&
      (item.sec.top_10_holder_rate !== undefined || item.sec.is_honeypot !== undefined || item.sec.address !== undefined);

    if (hasValidSec) {
      console.log(`  [SECURITY] Zaten mevcut ve dolu (Top 10: ${item.sec.top_10_holder_rate || 0}). Tekrar çekilmiyor.`);
    } else {
      console.log(`  [SECURITY EKSİK] GMGN token security sorgulanıyor...`);
      const secRes = runCmd(["token", "security", "--chain", "robinhood", "--address", addr, "--raw"]);
      const rawSec = secRes?.data || secRes;

      if (rawSec && typeof rawSec === "object" && (rawSec.address || rawSec.top_10_holder_rate !== undefined || rawSec.is_honeypot !== undefined)) {
        item.sec = rawSec;
        updatedSecCount++;
        console.log(`  [SECURITY BAŞARILI] Top10: ${rawSec.top_10_holder_rate}, Honeypot: ${rawSec.is_honeypot ? "EVET" : "HAYIR"}, BuyTax: ${rawSec.buy_tax}%, SellTax: ${rawSec.sell_tax}%`);
      } else {
        console.warn(`  [SECURITY BAŞARISIZ] ${sym} için token security alınamadı.`);
      }
    }

    // 3. Check Klines
    const hasValidKlines = Array.isArray(item.klines) && item.klines.length > 0;
    if (hasValidKlines) {
      preservedKlinesCount += item.klines.length;
      console.log(`  [KLINES] Zaten mevcut (${item.klines.length} mum). Tekrar çekilmiyor.`);
    } else {
      console.log(`  [KLINES EKSİK] 1m mumlar sorgulanıyor...`);
      const klineRes = runCmd([
        "market",
        "kline",
        "--chain",
        "robinhood",
        "--address",
        addr,
        "--resolution",
        "1m",
        "--from",
        String(from),
        "--to",
        String(now),
        "--raw",
      ]);
      const klines = klineRes?.list || [];
      item.klines = klines;
      item.klinesCount = klines.length;
      console.log(`  [KLINES ALINDI] ${klines.length} mum kaydedildi.`);
    }

    // 4. Save checkpoint after each token to ensure progress is never lost
    const checkpointPayload = {
      timestamp: existingPayload?.timestamp || Date.now(),
      lastUpdate: Date.now(),
      smTrades,
      kolTrades,
      tokenDataList,
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(checkpointPayload, null, 2));
    console.log(`  [CHECKPOINT KAYDEDİLDİ] ${sym} diske yazıldı.`);
  }

  console.log("\n==================================================");
  console.log("PHASE 3 VERİ TAMAMLAMA İŞLEMİ TAMAMLANDI");
  console.log(`- Toplam Token: ${tokenDataList.length}`);
  console.log(`- Tamamlanan Yeni Info Sayısı: ${updatedInfoCount}`);
  console.log(`- Tamamlanan Yeni Security Sayısı: ${updatedSecCount}`);
  console.log(`- Korunan / Yeniden Çekilmeyen Kline Sayısı: ${preservedKlinesCount}`);
  console.log(`- Smart Money Kayıtları: ${smTrades.length} (Korundu)`);
  console.log(`- KOL Kayıtları: ${kolTrades.length} (Korundu)`);
  console.log("==================================================");
}

collectPhase3Data().catch(console.error);

