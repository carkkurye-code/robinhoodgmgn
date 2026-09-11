/**
 * AVCI V2 RESEARCH ENGINE (Research & Backtesting Only)
 * 
 * IMPORTANT: This module is strictly for research and backtesting purposes.
 * It DOES NOT execute live trades, nor does it modify production BUY/SELL logic,
 * Dynamic Score, Trading Engine, or Paper Trading Engine.
 */

export interface EarlyWaveMetrics {
  timestamp: number;
  price: number;
  marketCap: number;
  liquidity: number;
  volume: number;
  buyUsd: number;
  sellUsd: number;
  netFlow: number;
  buyerRatio: number;
  
  // Real Wallet-Level Data vs Candle Estimate
  walletDataStatus: 'REAL_WALLET_LEVEL' | 'DATA_UNAVAILABLE';
  uniqueBuyers?: number;
  newBuyers?: number;
  repeatBuyers?: number;
  uniqueSellers?: number;
  buyerGrowthRate?: number;
  buyFrequencyPerSec?: number;
  sellFrequencyPerSec?: number;
  
  // Holder & Security Metrics
  holderCount?: number;
  holderConcentrationTop10?: number;
  devHoldRate?: number;
  botDegenRate?: number;
  bundlerTraderRate?: number;
  entrapmentTraderRate?: number;
  top70SniperHoldRate?: number;
  isWashTradingSuspected?: boolean;
}

export interface McEntryComparison {
  targetMc: number; // e.g. 1000, 2000, 3000, 5000, 10000, 20000, 50000
  reached: boolean;
  entryPrice: number;
  entryMc: number;
  entryLiquidity: number;
  entryVolume: number;
  
  subsequentUpsidePct: number;
  subsequentDrawdownPct: number;
  
  reachedPlus50: boolean;
  timeToPlus50Sec?: number;
  reachedPlus100: boolean;
  timeToPlus100Sec?: number;
  reachedPlus138: boolean; // $2.38 profit target on $1
  timeToPlus138Sec?: number;
  reachedPlus150: boolean;
  timeToPlus150Sec?: number;
  reachedPlus200: boolean;
  timeToPlus200Sec?: number;
  
  timelinePrices: Record<string, number>; // T+30s, T+1m, T+2m, T+3m, T+5m, T+10m, T+15m, T+30m
  maxUpsideTimeSec?: number;
  collapseTimeSec?: number;
}

export type TokenBehaviorClass = 
  | 'TRUE_RUNNER'
  | 'EARLY_RUNNER_THEN_DUMP'
  | 'SPIKE_DUMP'
  | 'DIRECT_DUMP'
  | 'CHOP'
  | 'DATA_INSUFFICIENT';

export type DemandClassification =
  | 'A_ORGANIC_EARLY_DEMAND'
  | 'B_FAKE_VOLUME_COORDINATED'
  | 'C_EARLY_SPIKE_EXIT_LIQUIDITY'
  | 'D_TRUE_RUNNER_CANDIDATE';

export interface AvciV2ScoreBreakdown {
  totalScore: number; // 0 - 100
  earlyDemandScore: number | 'DATA_UNAVAILABLE';
  holderQualityScore: number | 'DATA_UNAVAILABLE';
  sellPressureScore: number | 'DATA_UNAVAILABLE';
  liquidityScore: number | 'DATA_UNAVAILABLE';
  manipulationRiskScore: number | 'DATA_UNAVAILABLE';
  priceStructureScore: number;
  
  // Key Divergence Feature
  priceVsDemandDivergence: 
    | 'BULLISH_CONVERGENCE' // Price Up + Real Demand Up
    | 'BEARISH_DIVERGENCE_EXIT' // Price Up + Real Demand Down / Early Exits
    | 'HEALTHY_PULLBACK' // Price Down + Buyers Still Rising
    | 'MANIPULATION_TRAP' // Price Up + Flat Holders / Wash Wallets
    | 'BREAKDOWN' // Price Down + Buyers Dropping
    | 'DATA_UNAVAILABLE';
    
  details: string[];
}

export interface StopLossSimulationResult {
  slPct: number; // -10, -15, -20, -25, -30, -40
  triggered: boolean;
  triggerTimeSec?: number;
  wouldHaveHitTargetLater: boolean; // Pre-mature stop out on runner
  finalPnlPct: number;
}

export interface TokenBacktestReport {
  tokenSymbol: string;
  tokenAddress: string;
  classification: TokenBehaviorClass;
  demandType: DemandClassification;
  avciV2Score: AvciV2ScoreBreakdown;
  
  // Multi-MC Entry Comparisons
  entryComparisons: Record<string, McEntryComparison>;
  
  // Sub-minute granular analysis (10s, 20s, 30s, 45s, 60s)
  subMinuteWindows: Record<string, {
    price: number;
    volume: number;
    netFlow: number;
    buyerRatio: number;
    priceChangePct: number;
    walletDataStatus: string;
  }>;
  
  // $1 -> $2.38 and $1 -> $2.55 backtest
  target238Hit: boolean;
  target255Hit: boolean;
  timeTo238Sec?: number;
  maxDrawdownBeforeTargetPct?: number;
  upsideAfterTargetPct?: number;
  maxLossPctIfNoTarget?: number;
  
  // Stop-loss experiments (-10% to -40%)
  stopLossExperiments: Record<string, StopLossSimulationResult>;
  
  // Specific Qualitative Observation (IF vs OOF vs FLYBRAIN etc.)
  auditNotes: string;
}

export class AvciV2ResearchEngine {
  /**
   * Evaluates early entry dynamics at multiple hypothetical market cap levels
   */
  public evaluateEntryAtMarketCaps(
    klines: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
    initialSupply: number = 1_000_000_000,
    initialLiquidity: number = 10_000
  ): Record<string, McEntryComparison> {
    const targetMcs = [1000, 2000, 3000, 5000, 10000, 20000, 50000];
    const results: Record<string, McEntryComparison> = {};

    if (!klines || klines.length === 0) return results;
    const t0Time = klines[0].time;

    for (const targetMc of targetMcs) {
      const targetPrice = targetMc / initialSupply;
      let entryIndex = -1;

      // Find first candle where price cross targetPrice
      for (let i = 0; i < klines.length; i++) {
        if (klines[i].low <= targetPrice && klines[i].high >= targetPrice) {
          entryIndex = i;
          break;
        } else if (klines[i].close >= targetPrice) {
          entryIndex = i;
          break;
        }
      }

      if (entryIndex === -1) {
        results[`$${targetMc / 1000}K`] = {
          targetMc,
          reached: false,
          entryPrice: targetPrice,
          entryMc: targetMc,
          entryLiquidity: initialLiquidity,
          entryVolume: 0,
          subsequentUpsidePct: 0,
          subsequentDrawdownPct: 0,
          reachedPlus50: false,
          reachedPlus100: false,
          reachedPlus138: false,
          reachedPlus150: false,
          reachedPlus200: false,
          timelinePrices: {},
        };
        continue;
      }

      const entryCandle = klines[entryIndex];
      const entryPrice = Math.max(targetPrice, entryCandle.open);
      let maxHigh = entryPrice;
      let minLow = entryPrice;
      let reachedPlus50 = false;
      let timeToPlus50Sec: number | undefined;
      let reachedPlus100 = false;
      let timeToPlus100Sec: number | undefined;
      let reachedPlus138 = false;
      let timeToPlus138Sec: number | undefined;
      let reachedPlus150 = false;
      let timeToPlus150Sec: number | undefined;
      let reachedPlus200 = false;
      let timeToPlus200Sec: number | undefined;
      let maxUpsideTimeSec: number | undefined;
      let collapseTimeSec: number | undefined;

      const timelinePrices: Record<string, number> = {};

      for (let j = entryIndex; j < klines.length; j++) {
        const c = klines[j];
        const elapsedSec = Math.round((c.time - entryCandle.time) / 1000);

        if (c.high > maxHigh) {
          maxHigh = c.high;
          maxUpsideTimeSec = elapsedSec;
        }
        if (c.low < minLow) {
          minLow = c.low;
        }

        const gainPct = ((c.high - entryPrice) / entryPrice) * 100;
        const lossPct = ((c.low - entryPrice) / entryPrice) * 100;

        if (gainPct >= 50 && !reachedPlus50) {
          reachedPlus50 = true;
          timeToPlus50Sec = elapsedSec;
        }
        if (gainPct >= 100 && !reachedPlus100) {
          reachedPlus100 = true;
          timeToPlus100Sec = elapsedSec;
        }
        if (gainPct >= 138 && !reachedPlus138) {
          reachedPlus138 = true;
          timeToPlus138Sec = elapsedSec;
        }
        if (gainPct >= 150 && !reachedPlus150) {
          reachedPlus150 = true;
          timeToPlus150Sec = elapsedSec;
        }
        if (gainPct >= 200 && !reachedPlus200) {
          reachedPlus200 = true;
          timeToPlus200Sec = elapsedSec;
        }

        if (lossPct <= -70 && !collapseTimeSec) {
          collapseTimeSec = elapsedSec;
        }

        // Timeline milestones
        if (elapsedSec <= 30 && !timelinePrices['T+30s']) timelinePrices['T+30s'] = c.close;
        if (elapsedSec >= 60 && !timelinePrices['T+1m']) timelinePrices['T+1m'] = c.close;
        if (elapsedSec >= 120 && !timelinePrices['T+2m']) timelinePrices['T+2m'] = c.close;
        if (elapsedSec >= 180 && !timelinePrices['T+3m']) timelinePrices['T+3m'] = c.close;
        if (elapsedSec >= 300 && !timelinePrices['T+5m']) timelinePrices['T+5m'] = c.close;
        if (elapsedSec >= 600 && !timelinePrices['T+10m']) timelinePrices['T+10m'] = c.close;
        if (elapsedSec >= 900 && !timelinePrices['T+15m']) timelinePrices['T+15m'] = c.close;
        if (elapsedSec >= 1800 && !timelinePrices['T+30m']) timelinePrices['T+30m'] = c.close;
      }

      results[`$${targetMc / 1000}K`] = {
        targetMc,
        reached: true,
        entryPrice,
        entryMc: entryPrice * initialSupply,
        entryLiquidity: initialLiquidity,
        entryVolume: entryCandle.volume,
        subsequentUpsidePct: entryPrice > 0 ? ((maxHigh - entryPrice) / entryPrice) * 100 : 0,
        subsequentDrawdownPct: entryPrice > 0 ? ((minLow - entryPrice) / entryPrice) * 100 : 0,
        reachedPlus50,
        timeToPlus50Sec,
        reachedPlus100,
        timeToPlus100Sec,
        reachedPlus138,
        timeToPlus138Sec,
        reachedPlus150,
        timeToPlus150Sec,
        reachedPlus200,
        timeToPlus200Sec,
        timelinePrices,
        maxUpsideTimeSec,
        collapseTimeSec,
      };
    }

    return results;
  }

  /**
   * Simulates stop loss levels across research trades
   */
  public simulateStopLosses(
    klines: Array<{ time: number; open: number; high: number; low: number; close: number }>,
    entryPrice: number,
    targetGainPct: number = 138.0 // $2.38 target
  ): Record<string, StopLossSimulationResult> {
    const slLevels = [-10, -15, -20, -25, -30, -40];
    const results: Record<string, StopLossSimulationResult> = {};

    if (!klines || klines.length === 0 || entryPrice <= 0) return results;
    const entryTime = klines[0].time;

    for (const sl of slLevels) {
      let triggered = false;
      let triggerTimeSec: number | undefined;
      let wouldHaveHitTargetLater = false;
      let targetHitBeforeSL = false;

      for (let i = 0; i < klines.length; i++) {
        const c = klines[i];
        const elapsedSec = Math.round((c.time - entryTime) / 1000);
        const highGain = ((c.high - entryPrice) / entryPrice) * 100;
        const lowGain = ((c.low - entryPrice) / entryPrice) * 100;

        if (highGain >= targetGainPct && !triggered) {
          targetHitBeforeSL = true;
          break; // Won before SL triggered
        }

        if (lowGain <= sl && !triggered) {
          triggered = true;
          triggerTimeSec = elapsedSec;
        }

        if (triggered && highGain >= targetGainPct) {
          wouldHaveHitTargetLater = true;
          break;
        }
      }

      const finalClose = klines[klines.length - 1].close;
      const finalPnlPct = triggered ? sl : targetHitBeforeSL ? targetGainPct : ((finalClose - entryPrice) / entryPrice) * 100;

      results[`${sl}%`] = {
        slPct: sl,
        triggered,
        triggerTimeSec,
        wouldHaveHitTargetLater,
        finalPnlPct,
      };
    }

    return results;
  }

  /**
   * Computes the AVCI V2 research score from multi-dimensional factors
   */
  public calculateAvciV2Score(params: {
    priceChange1m: number;
    priceChange5m: number;
    volumeSurge: number;
    buyVolumeRatio: number;
    // Granular GMGN / on-chain stats if available
    uniqueBuyersAvailable: boolean;
    uniqueBuyers?: number;
    uniqueSellers?: number;
    holderCount?: number;
    botDegenRate?: number;
    bundlerTraderRate?: number;
    entrapmentTraderRate?: number;
    top70SniperHoldRate?: number;
    isWashTradingSuspected?: boolean;
    earlyBuyerExits?: boolean;
  }): AvciV2ScoreBreakdown {
    const details: string[] = [];
    let priceStructureScore = 50;

    // Price Structure
    if (params.priceChange1m > 2.0 && params.priceChange5m > 5.0) {
      priceStructureScore += 30;
      details.push('Pozitif 1m/5m momentum uyumu (+30)');
    } else if (params.priceChange1m < -3.0) {
      priceStructureScore -= 30;
      details.push('Ani 1m kırılım (-30)');
    }

    // Early Demand
    let earlyDemandScore: number | 'DATA_UNAVAILABLE' = 'DATA_UNAVAILABLE';
    if (params.uniqueBuyersAvailable && params.uniqueBuyers !== undefined) {
      let ed = 50;
      if (params.uniqueBuyers > 50) ed += 30;
      else if (params.uniqueBuyers > 20) ed += 15;
      else ed -= 20;
      earlyDemandScore = Math.max(0, Math.min(100, ed));
    }

    // Holder Quality
    let holderQualityScore: number | 'DATA_UNAVAILABLE' = 'DATA_UNAVAILABLE';
    if (params.holderCount !== undefined) {
      let hq = 50;
      if (params.holderCount > 100) hq += 30;
      else if (params.holderCount > 30) hq += 15;
      else hq -= 20;
      holderQualityScore = Math.max(0, Math.min(100, hq));
    }

    // Manipulation Risk
    let manipulationRiskScore: number | 'DATA_UNAVAILABLE' = 'DATA_UNAVAILABLE';
    if (
      params.botDegenRate !== undefined ||
      params.bundlerTraderRate !== undefined ||
      params.entrapmentTraderRate !== undefined
    ) {
      let mr = 100; // 100 means low manipulation, 0 means high manipulation
      if ((params.botDegenRate || 0) > 0.40) {
        mr -= 40;
        details.push(`Yüksek bot-degen oranı (%${Math.round((params.botDegenRate || 0) * 100)})`);
      }
      if ((params.entrapmentTraderRate || 0) > 0.30) {
        mr -= 40;
        details.push(`Yüksek tuzak/entrapment oranı (%${Math.round((params.entrapmentTraderRate || 0) * 100)})`);
      }
      if ((params.bundlerTraderRate || 0) > 0.20) {
        mr -= 20;
        details.push(`Bundler cüzdan yoğunluğu (%${Math.round((params.bundlerTraderRate || 0) * 100)})`);
      }
      manipulationRiskScore = Math.max(0, Math.min(100, mr));
    }

    // Price vs Demand Divergence
    let divergence: AvciV2ScoreBreakdown['priceVsDemandDivergence'] = 'DATA_UNAVAILABLE';
    if (params.uniqueBuyersAvailable && params.uniqueBuyers !== undefined) {
      if (params.priceChange1m > 0 && params.uniqueBuyers > 20 && !params.earlyBuyerExits) {
        divergence = 'BULLISH_CONVERGENCE';
      } else if (params.priceChange1m > 0 && params.earlyBuyerExits) {
        divergence = 'BEARISH_DIVERGENCE_EXIT';
      } else if (params.priceChange1m < 0 && params.uniqueBuyers > 30) {
        divergence = 'HEALTHY_PULLBACK';
      } else if (params.isWashTradingSuspected) {
        divergence = 'MANIPULATION_TRAP';
      }
    } else {
      // Fallback based on buy volume ratio vs price
      if (params.priceChange1m > 0 && params.buyVolumeRatio >= 0.70) {
        divergence = 'BULLISH_CONVERGENCE';
      } else if (params.priceChange1m > 0 && params.buyVolumeRatio < 0.45) {
        divergence = 'BEARISH_DIVERGENCE_EXIT';
      } else if (params.priceChange1m < 0 && params.buyVolumeRatio >= 0.65) {
        divergence = 'HEALTHY_PULLBACK';
      } else {
        divergence = 'BREAKDOWN';
      }
    }

    // Aggregate score
    let score = priceStructureScore;
    if (typeof earlyDemandScore === 'number') score = (score + earlyDemandScore) / 2;
    if (typeof manipulationRiskScore === 'number') score = (score * 0.7) + (manipulationRiskScore * 0.3);

    return {
      totalScore: Math.round(Math.max(0, Math.min(99, score))),
      earlyDemandScore,
      holderQualityScore,
      sellPressureScore: 'DATA_UNAVAILABLE',
      liquidityScore: 'DATA_UNAVAILABLE',
      manipulationRiskScore,
      priceStructureScore,
      priceVsDemandDivergence: divergence,
      details,
    };
  }
}
