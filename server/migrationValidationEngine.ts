import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  ScannedToken,
  MigrationValidationResult,
  MigrationValidationWindow,
} from './types.js';

export class MigrationValidationEngine {
  private cache: Map<string, { result: MigrationValidationResult; cachedAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 45000; // 45 seconds cache to avoid hammering CLI

  private getGMGNBinaryPath(): string {
    const localBin = path.resolve(process.cwd(), 'node_modules/.bin/gmgn-cli');
    if (existsSync(localBin)) {
      return localBin;
    }
    return 'gmgn-cli';
  }

  /**
   * Safely execute gmgn-cli commands with a strict timeout and error capture.
   */
  private runGMGNCli(args: string[]): any | null {
    const bin = this.getGMGNBinaryPath();
    const apiKey = process.env.GMGN_API_KEY || '';

    try {
      const result = spawnSync(bin, args, {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GMGN_API_KEY: apiKey,
        },
      });

      if (!result.error && result.status === 0 && result.stdout) {
        return JSON.parse(result.stdout);
      }
    } catch (err) {
      console.warn(`[MigrationValidationEngine] CLI exec error (${args.slice(0, 2).join(' ')}):`, err);
    }
    return null;
  }

  /**
   * Evaluates post-migration order flow and classifies token behavior.
   * STRICT: This layer does NOT alter the existing BUY/SELL trading decision.
   */
  public async validateToken(
    tokenAddress: string,
    tokenData?: Partial<ScannedToken>
  ): Promise<MigrationValidationResult> {
    const normalizedAddress = tokenAddress.toLowerCase();
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(normalizedAddress);
    if (cached && (now - cached.cachedAt) < this.CACHE_TTL_MS) {
      return cached.result;
    }

    const defaultUnavailableResult: MigrationValidationResult = {
      migrationDetected: false,
      status: 'MIGRATION_DATA_UNAVAILABLE',
      statusBadge: '⚪ MIGRATION_DATA_UNAVAILABLE',
      riskScore: 50,
      netFlow1m: 0,
      netFlow2m: 0,
      netFlow3m: 0,
      buyerRatio1m: 0.5,
      buyUsd1m: 0,
      sellUsd1m: 0,
      volume1m: 0,
      isSpikeTrap: false,
      reasons: ['Tarihsel GMGN/on-chain migration verisine ulaşılamadı.'],
      windows: {},
      disclaimer: 'Bu alan araştırma amaçlıdır. Mevcut BUY/SELL kararını değiştirmez.',
      analyzedAt: now,
    };

    try {
      // 1. Fetch Token Info to determine Migration Status (T0)
      const tokenInfoRaw = this.runGMGNCli([
        'token',
        'info',
        '--chain',
        'robinhood',
        '--address',
        tokenAddress,
        '--raw',
      ]);

      const tokenObj = tokenInfoRaw?.data?.token || tokenInfoRaw?.data || tokenInfoRaw;
      if (!tokenObj) {
        this.cache.set(normalizedAddress, { result: defaultUnavailableResult, cachedAt: now });
        return defaultUnavailableResult;
      }

      // Check migration markers:
      // launchpad_status: 1 (migrated to DEX), open_timestamp / migrated_timestamp, migrated_pool
      const launchpadStatus = Number(tokenObj.launchpad_status ?? -1);
      const openTimestampSec = Number(tokenObj.open_timestamp || tokenObj.migrated_timestamp || tokenObj.pool_created_at || 0);
      const hasMigratedPool = Boolean(tokenObj.migrated_pool || (tokenObj.pool && tokenObj.pool.pool_address));
      const hasLaunchpad = Boolean(tokenObj.launchpad || tokenObj.launchpad_platform);

      const isMigrated = (launchpadStatus === 1) || (openTimestampSec > 0 && hasMigratedPool) || (hasMigratedPool && hasLaunchpad);

      if (!isMigrated) {
        const notMigratedResult: MigrationValidationResult = {
          migrationDetected: false,
          status: 'NOT_MIGRATED',
          statusBadge: '⚪ NOT_MIGRATED',
          riskScore: 50,
          netFlow1m: 0,
          netFlow2m: 0,
          netFlow3m: 0,
          buyerRatio1m: 0.5,
          buyUsd1m: 0,
          sellUsd1m: 0,
          volume1m: 0,
          isSpikeTrap: false,
          reasons: ['Token henüz DEX migration evresinde değil (Bonding Curve / Pre-migration evresi).'],
          windows: {},
          disclaimer: 'Bu alan araştırma amaçlıdır. Mevcut BUY/SELL kararını değiştirmez.',
          analyzedAt: now,
        };
        this.cache.set(normalizedAddress, { result: notMigratedResult, cachedAt: now });
        return notMigratedResult;
      }

      const migrationTimestampMs = openTimestampSec > 0 ? openTimestampSec * 1000 : (tokenData?.poolCreatedAt || now);

      // 2. Fetch 1m K-Lines for post-migration order flow analysis
      const kline1mRaw = this.runGMGNCli([
        'market',
        'kline',
        '--chain',
        'robinhood',
        '--address',
        tokenAddress,
        '--resolution',
        '1m',
        '--raw',
      ]);

      const rawCandles = kline1mRaw?.list || kline1mRaw?.data?.list || kline1mRaw?.data || (Array.isArray(kline1mRaw) ? kline1mRaw : []);
      if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
        const result: MigrationValidationResult = {
          ...defaultUnavailableResult,
          migrationDetected: true,
          migrationTimestamp: migrationTimestampMs,
          reasons: ['Migration tespit edildi ancak tarihsel 1m mum verisi henüz oluşmamış veya okunamadı.'],
        };
        this.cache.set(normalizedAddress, { result, cachedAt: now });
        return result;
      }

      // Sort candles ascending by time
      const candles = [...rawCandles].map((c: any) => ({
        time: Number(c.time || c.timestamp || c.t || 0) * (String(c.time || '').length === 10 ? 1000 : 1),
        open: Number(c.open || c.o || 0),
        high: Number(c.high || c.h || 0),
        low: Number(c.low || c.l || 0),
        close: Number(c.close || c.c || 0),
        volume: Number(c.volume || c.v || 0),
      })).filter((c) => c.time > 0 && c.close > 0)
        .sort((a, b) => a.time - b.time);

      if (candles.length === 0) {
        const result: MigrationValidationResult = {
          ...defaultUnavailableResult,
          migrationDetected: true,
          migrationTimestamp: migrationTimestampMs,
          reasons: ['Tarihsel mum dizisi boş.'],
        };
        this.cache.set(normalizedAddress, { result, cachedAt: now });
        return result;
      }

      // Find T0 candle (first candle at or right after migrationTimestampMs, or the closest candle)
      let t0Index = candles.findIndex((c) => Math.abs(c.time - migrationTimestampMs) <= 90000);
      if (t0Index === -1 && candles.length > 0) {
        let minDiff = Infinity;
        candles.forEach((c, i) => {
          const diff = Math.abs(c.time - migrationTimestampMs);
          if (diff < minDiff) {
            minDiff = diff;
            t0Index = i;
          }
        });
      }
      if (t0Index === -1) {
        t0Index = 0;
      }

      const t0Candle = candles[t0Index];
      const t0Price = t0Candle.open > 0 ? t0Candle.open : t0Candle.close;

      // Also try fetching 30s K-Lines for T+30s window
      const kline30sRaw = this.runGMGNCli([
        'market',
        'kline',
        '--chain',
        'robinhood',
        '--address',
        tokenAddress,
        '--resolution',
        '30s',
        '--raw',
      ]);
      const raw30sList = kline30sRaw?.list || kline30sRaw?.data?.list || kline30sRaw?.data || (Array.isArray(kline30sRaw) ? kline30sRaw : []);
      const candles30s = Array.isArray(raw30sList) ? raw30sList.map((c: any) => ({
        time: Number(c.time || c.timestamp || c.t || 0) * (String(c.time || '').length === 10 ? 1000 : 1),
        open: Number(c.open || c.o || 0),
        high: Number(c.high || c.h || 0),
        low: Number(c.low || c.l || 0),
        close: Number(c.close || c.c || 0),
        volume: Number(c.volume || c.v || 0),
      })).filter((c) => c.time > 0 && c.close > 0).sort((a, b) => a.time - b.time) : [];

      // Helper to decompose a candle into order flow
      const decomposeCandle = (c: { open: number; high: number; low: number; close: number; volume: number }, windowName: '30s' | '1m' | '2m' | '3m' | '5m'): MigrationValidationWindow => {
        const range = c.high - c.low;
        let buyerRatio = 0.5;
        if (range > 0.000000000001) {
          buyerRatio = (c.close - c.low) / range;
        } else if (c.close >= c.open) {
          buyerRatio = 1.0;
        } else {
          buyerRatio = 0.0;
        }
        buyerRatio = Math.max(0, Math.min(1, buyerRatio));

        const buyUsd = c.volume * buyerRatio;
        const sellUsd = c.volume * (1 - buyerRatio);
        const netFlow = buyUsd - sellUsd;

        let candleColor: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
        if (c.close > c.open * 1.002) candleColor = 'GREEN';
        else if (c.close < c.open * 0.998) candleColor = 'RED';

        const priceChangeVsT0 = t0Price > 0 ? ((c.close - t0Price) / t0Price) * 100 : 0;

        return {
          window: windowName,
          price: c.close,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          buyUsd,
          sellUsd,
          netFlow,
          buyerRatio,
          candleColor,
          priceChangeVsT0,
        };
      };

      const windows: Record<string, MigrationValidationWindow> = {};

      // Window T+30s
      if (candles30s.length > 0) {
        const c30 = candles30s[1] || candles30s[0];
        windows['30s'] = decomposeCandle(c30, '30s');
      } else if (candles[t0Index]) {
        // Fallback approximation from initial 1m candle
        windows['30s'] = decomposeCandle(candles[t0Index], '30s');
      }

      // Windows T+1m, T+2m, T+3m, T+5m
      const candle1m = candles[t0Index] || candles[0];
      const candle2m = candles[t0Index + 1] || candles[1] || candle1m;
      const candle3m = candles[t0Index + 2] || candles[2] || candle2m;
      const candle5m = candles[t0Index + 4] || candles[4] || candle3m;

      windows['1m'] = decomposeCandle(candle1m, '1m');
      windows['2m'] = decomposeCandle(candle2m, '2m');
      windows['3m'] = decomposeCandle(candle3m, '3m');
      windows['5m'] = decomposeCandle(candle5m, '5m');

      const netFlow1m = windows['1m']?.netFlow ?? 0;
      const netFlow2m = windows['2m']?.netFlow ?? 0;
      const netFlow3m = windows['3m']?.netFlow ?? 0;
      const buyerRatio1m = windows['1m']?.buyerRatio ?? 0.5;
      const buyUsd1m = windows['1m']?.buyUsd ?? 0;
      const sellUsd1m = windows['1m']?.sellUsd ?? 0;
      const volume1m = windows['1m']?.volume ?? 0;

      // 3. Look-Ahead Bias Free Validation Logic:
      // A) T+1m Net Flow positive?
      const is1mPositive = netFlow1m > 0;
      // B) T+2m Net Flow positive?
      const is2mPositive = netFlow2m > 0;
      // C) T+3m Net Flow heavily negative?
      const is3mDumping = netFlow3m < -100;
      // D) Buy USD > Sell USD?
      const isBuyDominant = buyUsd1m > sellUsd1m;
      // E) Buyer Ratio high?
      const isHighBuyerRatio = buyerRatio1m >= 0.70;
      // F) Price remains above T0?
      const currentClose = windows['2m']?.close ?? windows['1m']?.close ?? t0Price;
      const isPriceAboveT0 = currentClose >= (t0Price * 0.98); // Allow 2% tolerance for spread

      // G & H) Spike Trap Detection:
      // Price spike with weak or negative Net Flow, or extreme volume with minimal net accumulation
      const priceGain1m = windows['1m']?.priceChangeVsT0 ?? 0;
      const priceGain2m = windows['2m']?.priceChangeVsT0 ?? 0;
      const maxPriceGain = Math.max(priceGain1m, priceGain2m);

      const isSpikeTrap =
        (maxPriceGain >= 35 && (netFlow1m <= 0 || netFlow2m <= 0 || buyerRatio1m < 0.60)) ||
        (volume1m > 2000 && (netFlow1m / volume1m) < 0.15 && netFlow2m <= 0);

      const reasons: string[] = [];
      let riskScore = 50; // Neutral baseline

      if (is1mPositive) {
        riskScore += 15;
        reasons.push(`T+1m Net Flow pozitif (+$${Math.round(netFlow1m)}).`);
      } else {
        riskScore -= 20;
        reasons.push(`T+1m Net Flow zayıf/negatif ($${Math.round(netFlow1m)}).`);
      }

      if (is2mPositive) {
        riskScore += 15;
        reasons.push(`T+2m Net Flow pozitifliğini koruyor (+$${Math.round(netFlow2m)}).`);
      } else {
        riskScore -= 15;
        reasons.push(`T+2m Net Flow negatif ($${Math.round(netFlow2m)}).`);
      }

      if (!is3mDumping) {
        riskScore += 10;
      } else {
        riskScore -= 25;
        reasons.push(`T+3m Net Flow'da satış baskısı / dump dalgası ($${Math.round(netFlow3m)}).`);
      }

      if (isHighBuyerRatio) {
        riskScore += 10;
        reasons.push(`Alıcı oranı güçlü (%${Math.round(buyerRatio1m * 100)}).`);
      } else {
        riskScore -= 10;
        reasons.push(`Alıcı oranı düşük/yetersiz (%${Math.round(buyerRatio1m * 100)}).`);
      }

      if (isPriceAboveT0) {
        riskScore += 10;
        reasons.push('Fiyat T0 migration seviyesinin üzerinde seyrediyor.');
      } else {
        riskScore -= 25;
        reasons.push('Fiyat T0 seviyesinin altına sarktı.');
      }

      if (isSpikeTrap) {
        riskScore -= 30;
        reasons.push('⚠️ Spike tuzağı tespit edildi: Hacim/fiyat yükselmesine rağmen Net Flow zayıf veya negatif.');
      }

      // Clamp riskScore 0-100
      riskScore = Math.max(0, Math.min(100, riskScore));

      // Determine classification
      let status: 'MIGRATION_STRONG' | 'MIGRATION_NEUTRAL' | 'MIGRATION_RISKY' = 'MIGRATION_NEUTRAL';
      let statusBadge = '🟡 MIGRATION_NEUTRAL';

      const isSevereDump3m = netFlow3m < -200;

      if (riskScore >= 65 && is1mPositive && is2mPositive && !isSpikeTrap && isPriceAboveT0 && !isSevereDump3m) {
        status = 'MIGRATION_STRONG';
        statusBadge = '🟢 MIGRATION_STRONG';
      } else if (riskScore <= 45 || !is1mPositive || isSpikeTrap || !isPriceAboveT0 || netFlow2m < -100 || isSevereDump3m) {
        status = 'MIGRATION_RISKY';
        statusBadge = '🔴 MIGRATION_RISKY';
      } else {
        status = 'MIGRATION_NEUTRAL';
        statusBadge = '🟡 MIGRATION_NEUTRAL';
      }

      const finalResult: MigrationValidationResult = {
        migrationDetected: true,
        migrationTimestamp: migrationTimestampMs,
        t0Price,
        status,
        statusBadge,
        riskScore,
        netFlow1m,
        netFlow2m,
        netFlow3m,
        buyerRatio1m,
        buyUsd1m,
        sellUsd1m,
        volume1m,
        isSpikeTrap,
        reasons,
        windows,
        disclaimer: 'Bu alan araştırma amaçlıdır. Mevcut BUY/SELL kararını değiştirmez.',
        analyzedAt: now,
      };

      // Debug / Log output
      console.log(`[MigrationValidationEngine] Token: ${tokenData?.symbol || tokenAddress} -> Durum: ${statusBadge} | Skor: ${riskScore} | T+1m: $${netFlow1m.toFixed(0)} | T+2m: $${netFlow2m.toFixed(0)} | T+3m: $${netFlow3m.toFixed(0)} | Alıcı: %${Math.round(buyerRatio1m * 100)} | Spike Tuzağı: ${isSpikeTrap ? 'EVET' : 'HAYIR'}`);

      this.cache.set(normalizedAddress, { result: finalResult, cachedAt: now });
      return finalResult;
    } catch (err: any) {
      console.warn(`[MigrationValidationEngine] Analiz sırasında beklenmeyen hata:`, err?.message || err);
      const errResult: MigrationValidationResult = {
        ...defaultUnavailableResult,
        reasons: [`Hata: ${err?.message || 'Veri okunamadı'}`],
      };
      return errResult;
    }
  }
}
