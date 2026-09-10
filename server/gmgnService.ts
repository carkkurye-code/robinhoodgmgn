import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { GMGNConfig, ScannedToken } from './types.js';

export class GMGNService {
  private config: GMGNConfig;
  private baseUrl = 'https://gmgn.ai';
  private cachedTokens: ScannedToken[] = [];
  private lastFetchTime: number = 0;
  private lastSuccessTime: number = 0;
  private lastRadarError: string | null = null;
  private readonly CACHE_TTL_MS = 20000;
  private baseInitTime: number = Date.now();

  constructor(config: GMGNConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: Partial<GMGNConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): GMGNConfig {
    return this.config;
  }

  private getGMGNBinaryPath(): string {
    const localBin = path.resolve(process.cwd(), 'node_modules/.bin/gmgn-cli');
    if (existsSync(localBin)) {
      return localBin;
    }
    return 'gmgn-cli';
  }

  public getRadarStatus() {
    return {
      success: this.lastRadarError === null && this.cachedTokens.length > 0,
      source: 'GMGN OpenAPI (Robinhood Chain 4663)',
      tokenCount: this.cachedTokens.length,
      error: this.lastRadarError,
      lastFetchTime: this.lastFetchTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /**
   * Generates canonical payload and Ed25519/HMAC signature for GMGN API
   */
  public generateSignature(subPath: string, queryParams: Record<string, any> = {}, body: any = null) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sortedKeys = Object.keys(queryParams).sort();
    const sortedQuery = sortedKeys.map((k) => `${k}=${queryParams[k]}`).join('&');
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const canonicalString = `${timestamp}|${subPath}|${sortedQuery}|${bodyStr}`;

    let signature = '';
    let algorithm = 'Ed25519-Simulation';

    if (this.config.privateKey && this.config.privateKey.trim().length > 0) {
      try {
        const sign = crypto.createSign('SHA256');
        sign.update(canonicalString);
        sign.end();
        signature = sign.sign(this.config.privateKey, 'base64');
        algorithm = 'Ed25519/RSA-SHA256';
      } catch (err: any) {
        // Fallback to HMAC
        const hmac = crypto.createHmac('sha256', this.config.privateKey);
        hmac.update(canonicalString);
        signature = hmac.digest('hex');
        algorithm = 'HMAC-SHA256';
      }
    } else {
      // Deterministic signature simulator for paper-trading
      const hash = crypto.createHash('sha256');
      hash.update(`SIMULATED_KEY_${canonicalString}`);
      signature = hash.digest('hex').substring(0, 64);
    }

    return {
      timestamp,
      canonicalString,
      signature,
      algorithm,
    };
  }

  /**
   * Fetch new pools and swap ranking for Robinhood Chain (rh / 4663)
   */
  public async fetchRobinhoodTokens(): Promise<ScannedToken[]> {
    const now = Date.now();
    if (this.cachedTokens.length > 0 && (now - this.lastFetchTime) < this.CACHE_TTL_MS) {
      return this.cachedTokens;
    }

    // Update lastFetchTime to enforce cooldown and prevent repeated CLI hammering
    this.lastFetchTime = now;
    const bin = this.getGMGNBinaryPath();
    const apiKey = this.config.apiKey || process.env.GMGN_API_KEY || '';

    // 1. Query real Robinhood Chain (4663) data via GMGN OpenAPI
    try {
      const cliResult = spawnSync(bin, [
        'market',
        'trending',
        '--chain',
        'robinhood',
        '--interval',
        '1m',
        '--limit',
        '15',
        '--raw',
      ], {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GMGN_API_KEY: apiKey,
        },
      });

      if (!cliResult.error && cliResult.status === 0 && cliResult.stdout) {
        const parsed = JSON.parse(cliResult.stdout);
        const rankList = parsed?.data?.rank;
        if (Array.isArray(rankList) && rankList.length > 0) {
          const tokens = rankList.map((item: any) => this.mapGMGNToken(item));
          this.cachedTokens = tokens;
          this.lastFetchTime = now;
          this.lastSuccessTime = now;
          this.lastRadarError = null;
          return tokens;
        } else if (Array.isArray(rankList) && rankList.length === 0) {
          this.lastRadarError = 'GMGN Robinhood radarında şu an aktif işlem gören token bulunamadı.';
        }
      } else {
        const errMsg = cliResult.error?.message || cliResult.stderr || `Exit code ${cliResult.status}`;
        this.lastRadarError = `GMGN API Hatası: ${errMsg}`;
        console.warn('GMGN CLI fetch error:', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      this.lastRadarError = `GMGN Bağlantı Hatası: ${errMsg}`;
      console.warn('GMGN CLI fetch exception:', err);
    }

    if (this.cachedTokens.length > 0) {
      return this.cachedTokens;
    }

    // STRICT USER MANDATE: generatePaperTokens() must NEVER be used in real trading radar!
    // If real GMGN data cannot be fetched, report error and return empty token list.
    return [];
  }

  /**
   * Fetch single token data by contract address (token info / pool / security)
   * When bypassCache is true, skips memory cache and queries live on-chain data directly
   */
  public async fetchTokenByAddress(tokenAddress: string, bypassCache: boolean = false): Promise<ScannedToken | null> {
    if (!tokenAddress) return null;
    const normalized = tokenAddress.toLowerCase();

    // 1. Check in-memory cached tokens if bypassCache is not requested
    if (!bypassCache) {
      const cached = this.cachedTokens.find((t) => t.address.toLowerCase() === normalized);
      if (cached) {
        return cached;
      }
    }

    // 2. Query official GMGN for address-based token info
    const bin = this.getGMGNBinaryPath();
    const apiKey = this.config.apiKey || process.env.GMGN_API_KEY || '';

    try {
      const cliResult = spawnSync(bin, [
        'token',
        'info',
        '--chain',
        'robinhood',
        '--address',
        tokenAddress,
        '--raw',
      ], {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GMGN_API_KEY: apiKey,
        },
      });

      if (!cliResult.error && cliResult.status === 0 && cliResult.stdout) {
        const parsed = JSON.parse(cliResult.stdout);
        const item = parsed?.data?.token || parsed?.data || parsed;
        if (item && (item.price || item.address || item.token_address)) {
          const freshToken = this.mapGMGNToken(item);
          // Update cached token reference if token exists in cachedTokens
          const existingIndex = this.cachedTokens.findIndex((t) => t.address.toLowerCase() === normalized);
          if (existingIndex !== -1) {
            this.cachedTokens[existingIndex] = freshToken;
          }
          return freshToken;
        }
      }
    } catch (err) {
      console.warn(`GMGN CLI fetch error for ${tokenAddress}:`, err);
    }

    // Return null if token is not found on-chain (do not invent fake prices or fallback to paper)
    return null;
  }

  private mapGMGNToken(item: any): ScannedToken {
    // If item.price is an object (from token info command), extract nested price properties
    const priceObj = typeof item.price === 'object' && item.price !== null ? item.price : null;
    const currentPrice = priceObj ? Number(priceObj.price) : Number(item.price) || 0.01;

    const buys = Number(item.buys) || (priceObj ? Number(priceObj.buys_1m) : 0) || Number(item.buys_1m) || 0;
    const sells = Number(item.sells) || (priceObj ? Number(priceObj.sells_1m) : 0) || Number(item.sells_1m) || 0;
    const swaps = Number(item.swaps) || (priceObj ? Number(priceObj.swaps_1m) : 0) || Number(item.swaps_1m) || (buys + sells) || 1;
    const buyRatio = (buys + sells) > 0 ? buys / (buys + sells) : (item.buyRatio1m ?? 0.5);

    // 1. Gerçek USD Buy/Sell Flow: GMGN'den buy_volume_1m ve sell_volume_1m
    const rawBuyVol1m = item.buy_volume_1m !== undefined && item.buy_volume_1m !== null
      ? Number(item.buy_volume_1m)
      : (priceObj && priceObj.buy_volume_1m !== undefined && priceObj.buy_volume_1m !== null
        ? Number(priceObj.buy_volume_1m)
        : undefined);
    const rawSellVol1m = item.sell_volume_1m !== undefined && item.sell_volume_1m !== null
      ? Number(item.sell_volume_1m)
      : (priceObj && priceObj.sell_volume_1m !== undefined && priceObj.sell_volume_1m !== null
        ? Number(priceObj.sell_volume_1m)
        : undefined);

    const buyVolume1m = rawBuyVol1m !== undefined && !isNaN(rawBuyVol1m) ? rawBuyVol1m : undefined;
    const sellVolume1m = rawSellVol1m !== undefined && !isNaN(rawSellVol1m) ? rawSellVol1m : undefined;

    let buyVolumeRatio1m: number | undefined = undefined;
    if (buyVolume1m !== undefined && sellVolume1m !== undefined) {
      const totalVol1m = buyVolume1m + sellVolume1m;
      if (totalVol1m > 0) {
        buyVolumeRatio1m = buyVolume1m / totalVol1m;
      }
    }

    const rawVolume = Number(item.volume) || (priceObj ? Number(priceObj.volume_1m) : 0) || 0;
    const volume1m = Number(item.volume_1m) || (priceObj ? Number(priceObj.volume_1m) : 0) || (rawVolume > 0 ? rawVolume / 60 : 1200);
    const volume5m = Number(item.volume_5m) || (priceObj ? Number(priceObj.volume_5m) : 0) || (rawVolume > 0 ? (rawVolume / 60) * 5 : 5400);

    const priceChange1m = Number(item.price_change_percent1m) || Number(item.price_change_1m) || (item.stat ? Number(item.stat.price_change_percent1m || item.stat.price_change_1m || 0) : 0) || (priceObj ? Number(priceObj.price_change_percent1m || priceObj.price_change_1m || 0) : 0) || 0;
    const priceChange5m = Number(item.price_change_percent5m) || Number(item.price_change_5m) || (item.stat ? Number(item.stat.price_change_percent5m || item.stat.price_change_5m || 0) : 0) || (priceObj ? Number(priceObj.price_change_percent5m || priceObj.price_change_5m || 0) : 0) || 0;

    // 2. Sniper / Bot Koruması: GMGN'den top70_sniper_hold_rate ve bot_degen_rate
    const rawSniper = item.top70_sniper_hold_rate !== undefined && item.top70_sniper_hold_rate !== null
      ? Number(item.top70_sniper_hold_rate)
      : (item.stat?.top70_sniper_hold_rate !== undefined && item.stat?.top70_sniper_hold_rate !== null
        ? Number(item.stat.top70_sniper_hold_rate)
        : undefined);
    const top70SniperHoldRate = rawSniper !== undefined && !isNaN(rawSniper) ? rawSniper : undefined;

    const rawBotDegen = item.bot_degen_rate !== undefined && item.bot_degen_rate !== null
      ? Number(item.bot_degen_rate)
      : (item.stat?.bot_degen_rate !== undefined && item.stat?.bot_degen_rate !== null
        ? Number(item.stat.bot_degen_rate)
        : (item.top_bot_degen_percentage !== undefined && item.top_bot_degen_percentage !== null
          ? Number(item.top_bot_degen_percentage)
          : undefined));
    const botDegenRate = rawBotDegen !== undefined && !isNaN(rawBotDegen) ? rawBotDegen : undefined;

    const top10 = Number(item.top_10_holder_rate) || Number(item.stat?.top_10_holder_rate) || 0.25;

    // 3. Liquidity Drain Guard: GMGN'den initial_liquidity ve current liquidity
    const rawInitLiq = item.initial_liquidity !== undefined && item.initial_liquidity !== null
      ? Number(item.initial_liquidity)
      : (item.pool && item.pool.initial_liquidity !== undefined && item.pool.initial_liquidity !== null
        ? Number(item.pool.initial_liquidity)
        : (item.stat && item.stat.initial_liquidity !== undefined && item.stat.initial_liquidity !== null
          ? Number(item.stat.initial_liquidity)
          : undefined));
    const initialLiquidityUsd = rawInitLiq !== undefined && !isNaN(rawInitLiq) && rawInitLiq > 0 ? rawInitLiq : undefined;

    const currentLiquidity = Number(item.liquidity) || (item.pool ? Number(item.pool.liquidity) : 25000);

    return {
      address: item.address || item.token_address,
      symbol: item.symbol || 'UNKNOWN',
      name: item.name || 'Robinhood Token',
      priceUsd: currentPrice,
      marketCapUsd: Number(item.market_cap) || Number(item.usd_market_cap) || 100000,
      liquidityUsd: currentLiquidity,
      initialLiquidityUsd,
      volume1m,
      volume5m,
      buyVolume1m,
      sellVolume1m,
      buyVolumeRatio1m,
      priceChange1m,
      priceChange5m,
      swaps1m: Math.max(1, swaps),
      buyRatio1m: buyRatio,
      continuationProbability: 50,
      continuationVerdict: 'MODERATE',
      security: {
        isHoneypot: Boolean(item.is_honeypot),
        renouncedMint: Boolean(item.is_renounced !== undefined ? item.is_renounced : item.renounced_mint),
        top10HolderRate: top10,
        buyTax: Number(item.buy_tax) || 0,
        sellTax: Number(item.sell_tax) || 0,
        top70SniperHoldRate,
        botDegenRate,
      },
      smartMoneyInflowUsd: Number(item.smart_money_inflow) || (Number(item.smart_degen_count) || 0) * 100,
      poolCreatedAt: item.creation_timestamp
        ? item.creation_timestamp * 1000
        : (item.open_timestamp ? item.open_timestamp * 1000 : Date.now() - 180000),
      tokenStage: item.tokenStage || (item.is_new || (item.creation_timestamp && (Date.now() - item.creation_timestamp * 1000) < 1800000) ? 'NEW_ENTRY' : 'SATURATED_HIGH_CAP'),
    };
  }

  public getQuote(tokenAddress: string, amountUsdt: number, currentPriceUsd?: number) {
    // GMGN quote calculation for Robinhood Chain (Chain 4663)
    const basePriceImpact = Math.min(amountUsdt / 25000 * 100, 3.5);
    const effectiveSlippage = 0.5 + basePriceImpact * 0.4;
    const price = (currentPriceUsd && currentPriceUsd > 0) ? currentPriceUsd : 0.045;
    return {
      chainId: 4663,
      chainSlug: 'rh',
      tokenIn: 'USDT',
      tokenOut: tokenAddress,
      amountIn: amountUsdt,
      expectedOut: (amountUsdt / price) * (1 - effectiveSlippage / 100),
      priceImpact: Number(basePriceImpact.toFixed(2)),
      effectiveSlippage: Number(effectiveSlippage.toFixed(2)),
      routerAddress: '0x4663000000000000000000000000000000004663',
      estimatedGasUsd: 0.02,
    };
  }

  private generatePaperTokens(): ScannedToken[] {
    const templates = [
      // 1. Yeni Giren - IOU Fırsatları (Erken Havuz, Organik Alıcı, Smart Money)
      {
        address: '0x6f386c311af0181de267c25fd63d58dcae7b53f4',
        symbol: 'IOU-NOTHING',
        name: 'IOU-NOTHING',
        basePrice: 0.000026,
        liq: 14200,
        buys: 0.61,
        p1: 2.8,
        p5: 8.4,
        mc: 11500,
        smartMoney: 1450,
        ageMs: 360000,
        isRisky: false,
        stage: 'NEW_ENTRY' as const,
      },
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14670',
        symbol: 'EXP',
        name: 'Robinhood Experiment',
        basePrice: 0.00184,
        liq: 16000,
        buys: 0.68,
        p1: 3.4,
        p5: 9.1,
        mc: 18400,
        smartMoney: 2100,
        ageMs: 420000,
        isRisky: false,
        stage: 'NEW_ENTRY' as const,
      },
      // 2. Yeni Giren fakat Erken Gözlemde Teyit Edilmemiş / Riskli Tokenler
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14671',
        symbol: 'CATK',
        name: 'Cat King Robinhood',
        basePrice: 0.0022,
        liq: 12500,
        buys: 0.88,
        p1: 12.5,
        p5: 14.0,
        mc: 22000,
        smartMoney: 450,
        ageMs: 180000,
        isRisky: false,
        stage: 'NEW_ENTRY' as const,
      },
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14674',
        symbol: 'ROVE',
        name: 'Robinhood Rover',
        basePrice: 0.025,
        liq: 10500,
        buys: 0.71,
        p1: 4.2,
        p5: 6.5,
        mc: 25000,
        smartMoney: 0,
        ageMs: 240000,
        isRisky: false,
        stage: 'NEW_ENTRY' as const,
      },
      // 3. Piyasada Zaten Yükselmiş / Olgunlaşmış / Doygun Tokenler (Skor Yüksek Olsa Bile BUY YASAK)
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14660',
        symbol: 'HOODX',
        name: 'Robinhood Ecosystem AI',
        basePrice: 0.0345,
        liq: 48000,
        buys: 0.88,
        p1: 5.2,
        p5: 18.4,
        mc: 340000,
        smartMoney: 5980,
        ageMs: 3600000,
        isRisky: false,
        stage: 'SATURATED_HIGH_CAP' as const,
      },
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14661',
        symbol: 'RHPEPE',
        name: 'Pepe of Robinhood',
        basePrice: 0.00042,
        liq: 82000,
        buys: 0.74,
        p1: 3.1,
        p5: 9.8,
        mc: 820000,
        smartMoney: 5500,
        ageMs: 7200000,
        isRisky: false,
        stage: 'SATURATED_HIGH_CAP' as const,
      },
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14664',
        symbol: 'LNDN',
        name: 'Little John DAO',
        basePrice: 0.0512,
        liq: 32000,
        buys: 0.81,
        p1: 4.8,
        p5: 14.5,
        mc: 290000,
        smartMoney: 6300,
        ageMs: 5400000,
        isRisky: false,
        stage: 'SATURATED_HIGH_CAP' as const,
      },
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14662',
        symbol: 'SHERIFF',
        name: 'Robinhood Chain Sheriff',
        basePrice: 0.125,
        liq: 18000,
        buys: 0.42,
        p1: -2.1,
        p5: 4.0,
        mc: 145000,
        smartMoney: 6400,
        ageMs: 4000000,
        isRisky: false,
        stage: 'SATURATED_HIGH_CAP' as const,
      },
      // 4. Güvenlik Riski / Honeypot / Düşük Likidite
      {
        address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14663',
        symbol: 'GOLDARROW',
        name: 'Golden Arrow Protocol',
        basePrice: 0.0089,
        liq: 9500,
        buys: 0.35,
        p1: -6.4,
        p5: -11.2,
        mc: 45000,
        smartMoney: 0,
        ageMs: 900000,
        isRisky: true,
        stage: 'RISKY' as const,
      },
    ];

    return templates.map((tmpl) => {
      // Small jitter for dynamic realism
      const jitter = (Math.random() - 0.48) * 0.03;
      const currentPrice = tmpl.basePrice * (1 + jitter);
      const isRisky = tmpl.isRisky;
      const poolCreatedAt = this.baseInitTime - tmpl.ageMs;
      const currentAgeMs = Date.now() - poolCreatedAt;
      // Havuz yaşı 30 dakikayı (1800000 ms) geçtiğinde token artık yeni giren değil, olgunlaşmış aşamaya geçer
      const effectiveStage = isRisky
        ? 'RISKY'
        : (tmpl.stage === 'NEW_ENTRY' && currentAgeMs < 1800000 ? 'NEW_ENTRY' : 'SATURATED_HIGH_CAP');

      return {
        address: tmpl.address,
        symbol: tmpl.symbol,
        name: tmpl.name,
        priceUsd: Number(currentPrice.toFixed(6)),
        marketCapUsd: Math.round(tmpl.mc * (1 + jitter)),
        liquidityUsd: Math.round(tmpl.liq * (1 + jitter)),
        volume1m: Math.round(tmpl.liq * 0.07 * (1 + Math.random())),
        volume5m: Math.round(tmpl.liq * 0.28 * (1 + Math.random())),
        priceChange1m: Number((tmpl.p1 + jitter * 5).toFixed(2)),
        priceChange5m: Number((tmpl.p5 + jitter * 5).toFixed(2)),
        swaps1m: Math.floor(18 + Math.random() * 20),
        buyRatio1m: Math.min(Math.max(Number((tmpl.buys + jitter * 0.5).toFixed(2)), 0.1), 0.99),
        continuationProbability: 0, // Calculated dynamically by analysisEngine
        continuationVerdict: 'MODERATE',
        tokenStage: effectiveStage,
        security: {
          isHoneypot: isRisky,
          renouncedMint: !isRisky,
          top10HolderRate: isRisky ? 0.65 : 0.22,
          buyTax: 0,
          sellTax: isRisky ? 0.25 : 0,
        },
        smartMoneyInflowUsd: tmpl.smartMoney,
        poolCreatedAt,
      };
    });
  }
}
