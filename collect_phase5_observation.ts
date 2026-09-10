import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { AnalysisEngine } from "./server/analysisEngine.js";

const BIN = "./node_modules/.bin/gmgn-cli";
const OUT_FILE = "./phase5_live_data.json";

function sleep(ms: number) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function getCliJson(args: string[], maxRetries = 1): any {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = spawnSync(BIN, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 7000 });
    const stdout = (res.stdout || "").trim();
    if (!stdout) {
      sleep(400);
      continue;
    }
    try {
      const parsed = JSON.parse(stdout);
      sleep(300);
      return parsed;
    } catch {
      sleep(300);
    }
  }
  return null;
}

async function run() {
  console.log("=== PHASE 5: LIVE PAPER TRADING OBSERVATION & DECISION LOG ===");
  console.log("Connecting to live Robinhood Chain (4663) via GMGN CLI...");

  const analysisEngine = new AnalysisEngine();

  // 1. Fetch live active tokens from Trending and Trenches
  const trendingRaw = getCliJson(["market", "trending", "--chain", "robinhood", "--interval", "1m", "--limit", "30", "--raw"]);
  const trenchesRaw = getCliJson(["market", "trenches", "--chain", "robinhood", "--limit", "30", "--raw"]);

  const trendingList = trendingRaw?.data?.rank || [];
  const completedList = trenchesRaw?.completed || [];
  const nearList = trenchesRaw?.near_completion || [];

  const candidateMap = new Map<string, any>();
  for (const item of [...trendingList, ...completedList, ...nearList]) {
    const addr = (item.address || item.token_address)?.toLowerCase();
    if (addr && !candidateMap.has(addr)) {
      candidateMap.set(addr, item);
    }
  }

  console.log(`Discovered ${candidateMap.size} unique active tokens on Robinhood Chain.`);

  // 2. Select active tokens with volume and liquidity for deep observation
  const selectedCandidates = [...candidateMap.values()]
    .filter(t => {
      const liq = parseFloat(t.liquidity || "0");
      return liq >= 300; // Liquid enough to trade
    })
    .slice(0, 32);

  console.log(`Selected ${selectedCandidates.length} high-activity tokens for real-time K-line & event extraction.`);

  const tokenObservations: any[] = [];
  const allEvents: any[] = [];
  const decisionLog: any[] = [];

  for (let i = 0; i < selectedCandidates.length; i++) {
    const item = selectedCandidates[i];
    const addr = (item.address || item.token_address)?.toLowerCase();
    const symbol = item.symbol || "UNKNOWN";
    console.log(`[${i + 1}/${selectedCandidates.length}] Observing live data for ${symbol} (${addr})...`);

    // Fetch token info
    const infoRaw = getCliJson(["token", "info", "--chain", "robinhood", "--address", addr, "--raw"]);
    const tokenInfo = infoRaw?.data?.token || infoRaw?.data || infoRaw || item;

    // Fetch token security
    const secRaw = getCliJson(["token", "security", "--chain", "robinhood", "--address", addr, "--raw"]);
    const tokenSec = secRaw?.data || secRaw || {};

    // Fetch 1m Klines
    const klineRaw = getCliJson(["market", "kline", "--chain", "robinhood", "--address", addr, "--resolution", "1m", "--raw"]);
    const klines = klineRaw?.list || [];

    if (!klines || klines.length < 10) {
      console.log(`  -> Skipped: Insufficient 1m klines (${klines?.length || 0})`);
      continue;
    }

    // Map token for AnalysisEngine evaluateToken
    const top10Rate = parseFloat(tokenInfo.dev?.top_10_holder_rate || tokenSec.top_10_holder_rate || item.top_10_holder_rate || "0.15");
    const mappedToken: any = {
      address: addr,
      symbol,
      name: tokenInfo.name || symbol,
      priceUsd: parseFloat(tokenInfo.price?.price || tokenInfo.price || item.price || "0"),
      marketCapUsd: parseFloat(tokenInfo.dev?.ath_token_info?.ath_mc || item.market_cap || item.usd_market_cap || "0"),
      liquidityUsd: parseFloat(tokenInfo.liquidity || tokenInfo.pool?.liquidity || item.liquidity || "0"),
      holderCount: parseInt(tokenInfo.holder_count || tokenInfo.stat?.holder_count || item.holder_count || "0", 10),
      top10HoldersPercent: top10Rate * 100,
      priceChange1m: parseFloat(tokenInfo.price?.price_1m || item.price_change_percent1m || "0"),
      priceChange5m: parseFloat(tokenInfo.price?.price_5m || item.price_change_percent5m || "0"),
      volume1m: parseFloat(tokenInfo.price?.volume_1m || "0"),
      volume5m: parseFloat(tokenInfo.price?.volume_5m || item.volume || "0"),
      buyVolume1m: parseFloat(tokenInfo.price?.buy_volume_1m || "0"),
      sellVolume1m: parseFloat(tokenInfo.price?.sell_volume_1m || "0"),
      buyRatio1m: tokenInfo.price?.buys_1m && tokenInfo.price?.sells_1m
        ? (tokenInfo.price.buys_1m / (tokenInfo.price.buys_1m + tokenInfo.price.sells_1m))
        : 0.5,
      security: {
        isHoneypot: tokenSec.is_honeypot === true || tokenSec.honeypot === 1,
        renouncedMint: tokenSec.is_renounced !== false,
        top10HolderRate: top10Rate,
        buyTax: parseFloat(tokenSec.buy_tax || "0"),
        sellTax: parseFloat(tokenSec.sell_tax || "0"),
        top70SniperHoldRate: parseFloat(tokenInfo.stat?.top70_sniper_hold_rate || "0.01"),
        botDegenRate: parseFloat(tokenInfo.stat?.bot_degen_rate || "0.1"),
      },
      smartMoneyInflowUsd: (tokenInfo.wallet_tags_stat?.smart_wallets || 0) * 100,
      poolCreatedAt: (tokenInfo.creation_timestamp || tokenInfo.open_timestamp || 0) * 1000,
      tokenStage: 'NEW_ENTRY',
      isNewOpportunity: true,
      iouMatch: 'TAM',
      iouMatchDetails: 'Live radar observation'
    };

    // Run current bot decision
    const botEval = analysisEngine.evaluateToken(mappedToken);
    const botDecision = botEval.shouldBuy ? "BUY" : "PASS";

    tokenObservations.push({
      symbol,
      address: addr,
      mappedToken,
      botDecision,
      botEval,
      klinesCount: klines.length
    });

    // 3. Extract events from Klines
    // An event is observed at T0 (e.g. dip candle <= -3%, significant continuation breakout, or consolidation point)
    // with at least 8-15 preceding candles for Prev15m and at least 5-15 forward candles for real outcome.
    for (let t0 = 8; t0 < klines.length - 5; t0++) {
      const cT0 = klines[t0];
      const openT0 = parseFloat(cT0.open);
      const closeT0 = parseFloat(cT0.close);
      const lowT0 = parseFloat(cT0.low);
      const highT0 = parseFloat(cT0.high);
      const volT0 = parseFloat(cT0.volume || "0");
      const candleChangeT0 = ((closeT0 - openT0) / openT0) * 100;

      // Event trigger: A meaningful event (dip <= -2.5%, breakout >= +5%, or key testing level)
      const isDipEvent = candleChangeT0 <= -2.5;
      const isBreakoutEvent = candleChangeT0 >= 5.0;
      const isConsolidationEvent = t0 % 5 === 0; // periodic sample

      if (!isDipEvent && !isBreakoutEvent && !isConsolidationEvent) {
        continue;
      }

      // Preceding 15m (or max available up to 15m) change
      const p15Idx = Math.max(0, t0 - 15);
      const openP15 = parseFloat(klines[p15Idx].open);
      const prev15mChange = ((closeT0 - openP15) / openP15) * 100;

      // Preceding 5m change
      const p5Idx = Math.max(0, t0 - 5);
      const openP5 = parseFloat(klines[p5Idx].open);
      const prev5mChange = ((closeT0 - openP5) / openP5) * 100;

      // Vol / Liq calculation
      const liqUsd = mappedToken.liquidityUsd || 1;
      const volToLiq = (volT0 / liqUsd) * 100;

      // Buyer ratio estimate at T0: close > open gives > 0.5, close < open gives < 0.5 scaled by candle wicks
      const candleRange = Math.max(highT0 - lowT0, 0.0000000001);
      const buyerFractionT0 = Math.max(0.05, Math.min(0.95, (closeT0 - lowT0) / candleRange));
      const buyUsdT0 = volT0 * buyerFractionT0;
      const sellUsdT0 = volT0 * (1 - buyerFractionT0);

      // --- T+1m OBSERVATION ---
      const c1 = klines[t0 + 1];
      const open1 = parseFloat(c1.open);
      const close1 = parseFloat(c1.close);
      const low1 = parseFloat(c1.low);
      const vol1 = parseFloat(c1.volume || "0");
      const next1mChange = ((close1 - open1) / open1) * 100;
      const next1mDirection = next1mChange > 0.1 ? "YEŞİL" : (next1mChange < -0.1 ? "KIRMIZI" : "DOJİ");
      const next1mLowBroken = low1 < lowT0;
      const buyerFraction1 = Math.max(0.05, Math.min(0.95, (close1 - parseFloat(c1.low)) / Math.max(parseFloat(c1.high) - parseFloat(c1.low), 0.0000000001)));
      const next1mBuyUsd = vol1 * buyerFraction1;
      const next1mSellUsd = vol1 * (1 - buyerFraction1);

      // --- T+2m OBSERVATION ---
      const c2 = klines[t0 + 2];
      const open2 = parseFloat(c2.open);
      const close2 = parseFloat(c2.close);
      const low2 = parseFloat(c2.low);
      const vol2 = parseFloat(c2.volume || "0");
      const next2mChange = ((close2 - open2) / open2) * 100;
      const next2mDirection = next2mChange > 0.1 ? "YEŞİL" : (next2mChange < -0.1 ? "KIRMIZI" : "DOJİ");
      const next2mLowBroken = low2 < lowT0;
      const buyerFraction2 = Math.max(0.05, Math.min(0.95, (close2 - parseFloat(c2.low)) / Math.max(parseFloat(c2.high) - parseFloat(c2.low), 0.0000000001)));
      const next2mBuyUsd = vol2 * buyerFraction2;
      const next2mSellUsd = vol2 * (1 - buyerFraction2);

      const bothGreen = next1mDirection === "YEŞİL" && next2mDirection === "YEŞİL";
      const bothRed = next1mDirection === "KIRMIZI" && next2mDirection === "KIRMIZI";
      const lowHeldBoth = !next1mLowBroken && !next2mLowBroken;

      // --- SUBSEQUENT OUTCOMES (T+5m, T+15m, T+30m) ---
      const forwardLimit = Math.min(klines.length - 1, t0 + 15);
      let maxPrice = closeT0;
      let minPrice = closeT0;

      for (let f = t0 + 1; f <= forwardLimit; f++) {
        const cF = klines[f];
        const hF = parseFloat(cF.high);
        const lF = parseFloat(cF.low);
        if (hF > maxPrice) maxPrice = hF;
        if (lF < minPrice) minPrice = lF;
      }

      const max15 = ((maxPrice - closeT0) / closeT0) * 100;
      const min15 = ((minPrice - closeT0) / closeT0) * 100;
      const close5 = t0 + 5 < klines.length ? parseFloat(klines[t0 + 5].close) : closeT0;
      const close15 = t0 + 15 < klines.length ? parseFloat(klines[t0 + 15].close) : parseFloat(klines[forwardLimit].close);
      const return5m = ((close5 - closeT0) / closeT0) * 100;
      const return15m = ((close15 - closeT0) / closeT0) * 100;

      const recovered15m = max15 >= 15.0;
      const collapsed15m = min15 <= -35.0 || return15m <= -35.0;

      // --- RESEARCH CLASSIFICATION (AVCI / AV GÖZLEMİ) ---
      // Using frozen Phase 3 & Phase 4 criteria:
      let researchClassification = "Neutral";

      if (prev15mChange >= 80 && (candleChangeT0 <= -2.5 || bothRed || min15 <= -30)) {
        // FOMO tepesinde yakalanan veya yüksek fiyatta gevşeyen
        researchClassification = "False Hunter Signal";
      } else if (bothRed && (next1mLowBroken || next2mLowBroken || min15 <= -30)) {
        // Satıcı baskısı devam eden, yeni dip kıran, çöken tahta
        researchClassification = "Prey / Collapse";
      } else if (prev15mChange < 50 && mappedToken.top10HoldersPercent < 25 && bothGreen && lowHeldBoth) {
        // Sağlıklı tabanda/erken dönemde çift yeşil teyitli avcı fırsatı
        researchClassification = "Hunter Signal";
      } else if (next1mDirection === "YEŞİL" && !next1mLowBroken && prev15mChange < 70) {
        // Tek yeşil mum teyidi veya erken toparlanma emareleri
        researchClassification = "Promising Signal";
      } else if (collapsed15m) {
        researchClassification = "Prey / Collapse";
      } else {
        researchClassification = "Neutral";
      }

      const eventObj = {
        tokenSymbol: symbol,
        tokenAddress: addr,
        t0_index: t0,
        t0_time: cT0.time,
        // T0 data
        priceT0: closeT0,
        marketCapT0: mappedToken.marketCapUsd,
        liquidityT0: mappedToken.liquidityUsd,
        holderCountT0: mappedToken.holderCount,
        top10RateT0: mappedToken.top10HoldersPercent,
        isHoneypot: mappedToken.security.isHoneypot,
        buyTax: mappedToken.security.buyTax,
        sellTax: mappedToken.security.sellTax,
        prev15mChange,
        candle1mChange: candleChangeT0,
        candle5mChange: prev5mChange,
        buyUsdT0,
        sellUsdT0,
        buyerRatioT0: buyerFractionT0,
        dropPercent: candleChangeT0 < 0 ? candleChangeT0 : 0,
        dropCandleVolume: volT0,
        volToLiq,
        hasSmartMoney: tokenInfo.wallet_tags_stat?.smart_wallets || 0,
        hasKOL: tokenInfo.wallet_tags_stat?.renowned_wallets || 0,
        // Current Bot Decision
        currentBotDecision: botDecision,
        botVerdict: botEval.verdict,
        botScore: botEval.score,
        botReason: botEval.reason,
        // T+1m observation
        next1mDirection,
        next1mChange,
        next1mBuyUsd,
        next1mSellUsd,
        next1mLowBroken,
        // T+2m observation
        next2mDirection,
        next2mChange,
        next2mBuyUsd,
        next2mSellUsd,
        next2mLowBroken,
        bothGreen,
        bothRed,
        lowHeldBoth,
        // Real outcome
        price5m: close5,
        price15m: close15,
        return5m,
        return15m,
        max15,
        min15,
        recovered15m,
        collapsed15m,
        // Final research class
        researchClassification
      };

      allEvents.push(eventObj);

      // Add to decision log (sample detailed logs for important events)
      if (isDipEvent || bothGreen || bothRed || botDecision === "BUY" || researchClassification === "Hunter Signal" || researchClassification === "False Hunter Signal") {
        decisionLog.push({
          token: `${symbol} (${addr.slice(0, 8)}...)`,
          t0_timestamp: new Date(cT0.time).toISOString(),
          T0_BOT_KNOWS: {
            fiyat: closeT0,
            market_cap: mappedToken.marketCapUsd,
            pool_likiditesi: mappedToken.liquidityUsd,
            holder_sayisi: mappedToken.holderCount,
            top10_orani: `${mappedToken.top10HoldersPercent.toFixed(1)}%`,
            honeypot: mappedToken.security.isHoneypot,
            buy_tax: mappedToken.security.buyTax,
            sell_tax: mappedToken.security.sellTax,
            prev15m_degisim: `${prev15mChange.toFixed(1)}%`,
            mevcut_1m_degisim: `${candleChangeT0.toFixed(1)}%`,
            mevcut_5m_degisim: `${prev5mChange.toFixed(1)}%`,
            buy_usd: buyUsdT0.toFixed(0),
            sell_usd: sellUsdT0.toFixed(0),
            buyer_ratio: `${(buyerFractionT0 * 100).toFixed(1)}%`,
            dusus_yuzdesi: candleChangeT0 < 0 ? `${candleChangeT0.toFixed(1)}%` : "Düşüş yok",
            dusus_hacmi: volT0.toFixed(0),
            vol_to_liq: `${volToLiq.toFixed(1)}%`,
            smart_money: tokenInfo.wallet_tags_stat?.smart_wallets || 0,
            kol_sayisi: tokenInfo.wallet_tags_stat?.renowned_wallets || 0,
            mevcut_bot_karari: botDecision,
            bot_skoru: botEval.score,
            bot_gerekcesi: botEval.reason
          },
          T_PLUS_1M: {
            mum_yonu: next1mDirection,
            fiyat_degisimi: `${next1mChange.toFixed(1)}%`,
            buy_usd: next1mBuyUsd.toFixed(0),
            sell_usd: next1mSellUsd.toFixed(0),
            low_kirildi_mi: next1mLowBroken ? "EVET (Kırıldı)" : "HAYIR (Korundu)"
          },
          T_PLUS_2M: {
            mum_yonu: next2mDirection,
            fiyat_degisimi: `${next2mChange.toFixed(1)}%`,
            buy_usd: next2mBuyUsd.toFixed(0),
            sell_usd: next2mSellUsd.toFixed(0),
            low_kirildi_mi: next2mLowBroken ? "EVET (Kırıldı)" : "HAYIR (Korundu)",
            cift_yesil_teyit: bothGreen,
            cift_kirmizi_baski: bothRed
          },
          SONRAKI_SONUC: {
            t5m_getiri: `${return5m.toFixed(1)}%`,
            t15m_getiri: `${return15m.toFixed(1)}%`,
            maks_yukselis_15m: `+${max15.toFixed(1)}%`,
            maks_geri_cekilme_15m: `${min15.toFixed(1)}%`,
            toparlandi_mi: recovered15m ? "EVET (+15m >= 15%)" : "HAYIR",
            coktu_mu: collapsed15m ? "EVET (-35% ve altı)" : "HAYIR",
            arastirma_sinifi: researchClassification
          }
        });
      }
    }
  }

  const payload = {
    phase: 5,
    timestamp: new Date().toISOString(),
    tokensAnalyzed: tokenObservations.length,
    eventsCount: allEvents.length,
    decisionLogCount: decisionLog.length,
    tokens: tokenObservations,
    events: allEvents,
    decisionLog: decisionLog.slice(0, 50) // Top 50 detailed decision logs
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`\nSuccessfully gathered Phase 5 live data!`);
  console.log(`Tokens Analyzed: ${tokenObservations.length}`);
  console.log(`Total Events Evaluated: ${allEvents.length}`);
  console.log(`Detailed Decision Logs Recorded: ${decisionLog.length}`);
}

run().catch(err => {
  console.error("Error in Phase 5 collection:", err);
  process.exit(1);
});
