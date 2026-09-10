import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { GMGNConfig, ScannedToken } from './types.js';

export class GMGNService {
  private config: GMGNConfig;
  private baseUrl = 'https://gmgn.ai';
  private cachedTokens: ScannedToken[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL_MS = 60000;

  constructor(config: GMGNConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: Partial<GMGNConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): GMGNConfig {
    return this.config;
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

    // 1. If GMGN CLI is available and configured, query real Robinhood Chain data
    try {
      const cliResult = spawnSync('gmgn-cli', [
        'market',
        'trending',
        '--chain',
        'robinhood',
        '--interval',
        '1m',
        '--limit',
        '6',
        '--raw',
      ], {
        encoding: 'utf8',
        timeout: 7000,
      });

      if (!cliResult.error && cliResult.status === 0 && cliResult.stdout) {
        const parsed = JSON.parse(cliResult.stdout);
        const rankList = parsed?.data?.rank;
        if (Array.isArray(rankList) && rankList.length > 0) {
          const tokens = rankList.map((item: any) => this.mapGMGNToken(item));
          this.cachedTokens = tokens;
          this.lastFetchTime = now;
          return tokens;
        }
      }
    } catch (err) {
      console.warn('GMGN CLI fetch error:', err);
    }

    if (this.cachedTokens.length > 0) {
      return this.cachedTokens;
    }

    // 2. High fidelity realistic Robinhood Chain pool stream for paper trading fallback
    return this.generatePaperTokens();
  }

  private mapGMGNToken(item: any): ScannedToken {
    const buys = Number(item.buys) || Number(item.buys_1m) || 0;
    const sells = Number(item.sells) || Number(item.sells_1m) || 0;
    const swaps = Number(item.swaps) || Number(item.swaps_1m) || (buys + sells) || 1;
    const buyRatio = (buys + sells) > 0 ? buys / (buys + sells) : (item.buyRatio1m ?? 0.5);

    const rawVolume = Number(item.volume) || 0;
    const volume1m = Number(item.volume_1m) || (rawVolume > 0 ? rawVolume / 60 : 1200);
    const volume5m = Number(item.volume_5m) || (rawVolume > 0 ? (rawVolume / 60) * 5 : 5400);

    return {
      address: item.address || item.token_address,
      symbol: item.symbol || 'UNKNOWN',
      name: item.name || 'Robinhood Token',
      priceUsd: Number(item.price) || 0.01,
      marketCapUsd: Number(item.market_cap) || 100000,
      liquidityUsd: Number(item.liquidity) || 25000,
      volume1m,
      volume5m,
      priceChange1m: Number(item.price_change_percent1m) || Number(item.price_change_1m) || 0,
      priceChange5m: Number(item.price_change_percent5m) || Number(item.price_change_5m) || 0,
      swaps1m: Math.max(1, Math.round(Number(item.swaps_1m) || (swaps / 60))),
      buyRatio1m: buyRatio,
      continuationProbability: 50,
      continuationVerdict: 'MODERATE',
      security: {
        isHoneypot: Boolean(item.is_honeypot),
        renouncedMint: Boolean(item.is_renounced !== undefined ? item.is_renounced : item.renounced_mint),
        top10HolderRate: Number(item.top_10_holder_rate) || 0.25,
        buyTax: Number(item.buy_tax) || 0,
        sellTax: Number(item.sell_tax) || 0,
      },
      smartMoneyInflowUsd: Number(item.smart_money_inflow) || (Number(item.smart_degen_count) || 0) * 100,
      poolCreatedAt: item.creation_timestamp
        ? item.creation_timestamp * 1000
        : (item.open_timestamp ? item.open_timestamp * 1000 : Date.now() - 180000),
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
      { symbol: 'HOODX', name: 'Robinhood Ecosystem AI', basePrice: 0.0345, liq: 48000, buys: 0.88, p1: 5.2, p5: 18.4, mc: 340000 },
      { symbol: 'RHPEPE', name: 'Pepe of Robinhood', basePrice: 0.00042, liq: 82000, buys: 0.74, p1: 3.1, p5: 9.8, mc: 820000 },
      { symbol: 'SHERIFF', name: 'Robinhood Chain Sheriff', basePrice: 0.125, liq: 18000, buys: 0.42, p1: -2.1, p5: 4.0, mc: 145000 },
      { symbol: 'GOLDARROW', name: 'Golden Arrow Protocol', basePrice: 0.0089, liq: 9500, buys: 0.35, p1: -6.4, p5: -11.2, mc: 45000 },
      { symbol: 'LNDN', name: 'Little John DAO', basePrice: 0.0512, liq: 32000, buys: 0.81, p1: 4.8, p5: 14.5, mc: 290000 },
    ];

    return templates.map((tmpl, idx) => {
      // Small jitter for dynamic realism
      const jitter = (Math.random() - 0.48) * 0.05;
      const currentPrice = tmpl.basePrice * (1 + jitter);
      const isRisky = tmpl.symbol === 'GOLDARROW';

      return {
        address: `0x4663a89f6b9c7b91d24ef090d8a1789c89e1466${idx}`,
        symbol: tmpl.symbol,
        name: tmpl.name,
        priceUsd: Number(currentPrice.toFixed(6)),
        marketCapUsd: Math.round(tmpl.mc * (1 + jitter)),
        liquidityUsd: Math.round(tmpl.liq * (1 + jitter)),
        volume1m: Math.round(tmpl.liq * 0.06 * (1 + Math.random())),
        volume5m: Math.round(tmpl.liq * 0.22 * (1 + Math.random())),
        priceChange1m: Number((tmpl.p1 + jitter * 10).toFixed(2)),
        priceChange5m: Number((tmpl.p5 + jitter * 10).toFixed(2)),
        swaps1m: Math.floor(18 + Math.random() * 25),
        buyRatio1m: Math.min(Math.max(Number((tmpl.buys + jitter).toFixed(2)), 0.1), 0.99),
        continuationProbability: 0, // Calculated dynamically by analysisEngine
        continuationVerdict: 'MODERATE',
        security: {
          isHoneypot: isRisky,
          renouncedMint: !isRisky,
          top10HolderRate: isRisky ? 0.65 : 0.22,
          buyTax: 0,
          sellTax: isRisky ? 0.25 : 0,
        },
        smartMoneyInflowUsd: isRisky ? 0 : Math.round(2500 + Math.random() * 4000),
        poolCreatedAt: Date.now() - (idx + 1) * 240000,
      };
    });
  }
}
