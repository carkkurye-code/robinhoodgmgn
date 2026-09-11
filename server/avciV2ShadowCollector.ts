/**
 * AVCI V2 SHADOW DATA COLLECTOR
 * 
 * STRICT RULES:
 * 1. ZERO changes to production trading, BUY/SELL thresholds, Paper Trading Engine.
 * 2. Real-time collection ONLY: No synthetic data, no guessed holders/buyers.
 * 3. Never backfill current snapshots as historical data.
 * 4. Explicit availability tagging: AVAILABLE_AT_DECISION | POST_DECISION | DATA_UNAVAILABLE.
 * 5. Persistent storage under research/avci-v2/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type AvailabilityTag = 'AVAILABLE_AT_DECISION' | 'POST_DECISION' | 'DATA_UNAVAILABLE';

export type AvciV2Decision = 'EARLY_BUY_CANDIDATE' | 'WATCH' | 'REJECT' | 'DATA_INSUFFICIENT';

export type RunnerClass = 
  | 'TRUE_RUNNER'
  | 'EARLY_SPIKE_THEN_DUMP'
  | 'DIRECT_DUMP'
  | 'CHOP'
  | 'DATA_INSUFFICIENT';

export interface ShadowMarketSnapshot {
  token: string;
  contract: string;
  observedAt: string;
  elapsedSeconds: number;
  discoveryType: 'EARLY_DISCOVERY' | 'LATE_DISCOVERY';

  market: {
    price: number | null;
    marketCap: number | null;
    liquidity: number | null;
    volume: number | null;
    liquidityMcRatio: number | null;
    estimatedPriceImpact: number | null | 'DATA_UNAVAILABLE';
  };

  flow: {
    buyVolume: number | null;
    sellVolume: number | null;
    buyerRatio: number | null;
    transactionCount: number | null;
  };

  wallet: {
    uniqueBuyers: number | null;
    uniqueSellers: number | null;
    holderCount: number | null;
    botRatio: number | null;
    entrapmentRatio: number | null;
    bundlerWallets: number | null;
  };

  availability: {
    historical: boolean;
    decisionTimeAvailable: AvailabilityTag;
  };

  derived: {
    buyerGrowth: number | null;
    volumeGrowth: number | null;
    priceAccelerationPct: number | null;
    liquidityDelta: number | null;
    demandStatus: 'DEMAND_CONFIRMED' | 'DEMAND_DIVERGENCE' | 'DATA_UNAVAILABLE';
  };
}

export interface ShadowResearchDecision {
  contract: string;
  tokenSymbol: string;
  decidedAt: string;
  decision: AvciV2Decision;
  reasons: string[];
  observedMarketCap: number | null;
  observedLiquidity: number | null;
  availableFeaturesCount: number;
  unavailableFeaturesCount: number;
}

export interface HypotheticalPosition {
  contract: string;
  tokenSymbol: string;
  entryAmountUsd: 1.0;
  entryTime: string;
  entryPrice: number;
  entryMarketCap: number;
  entryLiquidity: number;
  
  currentPrice: number;
  currentPnlPct: number;
  maxGainPct: number;
  maxDrawdownPct: number;
  
  targetObserved: boolean;
  targetObservedTime?: string;
  targetExecutable: 'YES' | 'NO' | 'UNKNOWN';
  
  // Milestones reached
  reachedPlus50: boolean;
  reachedPlus100: boolean;
  reachedPlus138: boolean; // Target
  reachedPlus150: boolean;
  reachedPlus200: boolean;
  reachedMinus10: boolean;
  reachedMinus20: boolean;
  reachedMinus30: boolean;
  reachedMinus50: boolean;
  reachedMinus80: boolean;
  collapsed: boolean;
  
  finalOutcomeClass?: RunnerClass;
}

export interface ShadowTokenProfile {
  contract: string;
  symbol: string;
  name: string;
  discoveryType: 'EARLY_DISCOVERY' | 'LATE_DISCOVERY';
  firstObservedAt: string;
  t0MarketCap: number | null;
  t0Liquidity: number | null;
  t0Price: number | null;
  snapshotsCount: number;
  lastSnapshotAt: string;
  decision?: AvciV2Decision;
  hypotheticalPosition?: HypotheticalPosition;
  outcomeClass?: RunnerClass;
}

function parseNullableNumber(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

export class AvciV2ShadowCollector {
  private baseDir: string;
  private tokensDir: string;
  private snapshotsDir: string;
  private decisionsDir: string;
  private outcomesDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.join(process.cwd(), 'research', 'avci-v2');
    this.tokensDir = path.join(this.baseDir, 'tokens');
    this.snapshotsDir = path.join(this.baseDir, 'snapshots');
    this.decisionsDir = path.join(this.baseDir, 'decisions');
    this.outcomesDir = path.join(this.baseDir, 'outcomes');

    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.baseDir, this.tokensDir, this.snapshotsDir, this.decisionsDir, this.outcomesDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Scans live Robinhood trenches from GMGN CLI
   */
  public fetchLiveTrenches(limit: number = 50): any[] {
    try {
      const res = spawnSync(
        './node_modules/.bin/gmgn-cli',
        ['market', 'trenches', '--chain', 'robinhood', '--limit', String(limit), '--raw'],
        { encoding: 'utf8', timeout: 15000 }
      );
      if (res.status === 0 && res.stdout) {
        const parsed = JSON.parse(res.stdout);
        return Array.isArray(parsed) ? parsed : parsed.data || [];
      }
    } catch (err) {
      console.error('[AvciV2ShadowCollector] Error fetching trenches:', err);
    }
    return [];
  }

  /**
   * Fetches real token info for a specific contract
   */
  public fetchTokenInfo(contract: string): any {
    try {
      const res = spawnSync(
        './node_modules/.bin/gmgn-cli',
        ['token', 'info', '--chain', 'robinhood', '--address', contract, '--raw'],
        { encoding: 'utf8', timeout: 10000 }
      );
      if (res.status === 0 && res.stdout) {
        return JSON.parse(res.stdout);
      }
    } catch (err) {}
    return null;
  }

  /**
   * Processes a live token observation and records T0 or updates time-series
   */
  public recordTokenObservation(rawToken: any): ShadowMarketSnapshot {
    const contract = (rawToken.address || rawToken.contract || '').toLowerCase();
    const symbol = rawToken.symbol || 'UNKNOWN';
    const nowIso = rawToken.observedAt || new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();

    const price = parseNullableNumber(rawToken.price);
    const marketCap = parseNullableNumber(rawToken.market_cap);
    const liquidity = parseNullableNumber(rawToken.liquidity);
    const volume = parseNullableNumber(rawToken.volume_24h);
    const buyVolume = parseNullableNumber(rawToken.buy_volume_24h);
    const sellVolume = parseNullableNumber(rawToken.sell_volume_24h);
    const swaps = parseNullableNumber(rawToken.swaps_24h);

    // Discovery type: Early ($1K-$10K) vs Late ($50K+)
    const discoveryType = (marketCap !== null && marketCap >= 50000) ? 'LATE_DISCOVERY' : 'EARLY_DISCOVERY';

    // Liquidity / MarketCap ratio
    const liquidityMcRatio = (liquidity !== null && marketCap !== null && marketCap > 0)
      ? Number((liquidity / marketCap).toFixed(4))
      : null;

    // Estimated price impact for hypothetical $1 order
    const estimatedPriceImpact = (liquidity !== null && liquidity > 0)
      ? Number(((1.0 / liquidity) * 100).toFixed(4))
      : 'DATA_UNAVAILABLE';

    // Wallet metrics from raw or GMGN info - strictly preserved as null when missing
    const holderCount = parseNullableNumber(rawToken.holder_count);
    const botRatio = parseNullableNumber(rawToken.bot_degen_rate);
    const entrapmentRatio = parseNullableNumber(rawToken.entrapment_ratio);
    const bundlerWallets = parseNullableNumber(rawToken.bundler_trader_amount_rate);

    // Check existing profile
    const profileFile = path.join(this.tokensDir, `${contract}.json`);
    let profile: ShadowTokenProfile;
    let previousSnapshot: ShadowMarketSnapshot | null = null;
    let elapsedSeconds = 0;

    if (fs.existsSync(profileFile)) {
      profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
      const firstMs = new Date(profile.firstObservedAt).getTime();
      elapsedSeconds = Math.max(0, Math.round((nowMs - firstMs) / 1000));

      // Try load previous snapshot
      const existingSnapshots = fs.readdirSync(this.snapshotsDir)
        .filter(f => f.startsWith(`${contract}_`))
        .sort();
      if (existingSnapshots.length > 0) {
        const lastSnapFile = path.join(this.snapshotsDir, existingSnapshots[existingSnapshots.length - 1]);
        try {
          previousSnapshot = JSON.parse(fs.readFileSync(lastSnapFile, 'utf8'));
        } catch (e) {}
      }
    } else {
      // First observation: T0
      profile = {
        contract,
        symbol,
        name: rawToken.name || symbol,
        discoveryType,
        firstObservedAt: nowIso,
        t0MarketCap: marketCap,
        t0Liquidity: liquidity,
        t0Price: price,
        snapshotsCount: 0,
        lastSnapshotAt: nowIso,
      };
      elapsedSeconds = 0;
    }

    // Dynamic Derived Features
    let buyerGrowth: number | null = null;
    let volumeGrowth: number | null = null;
    let priceAccelerationPct: number | null = null;
    let liquidityDelta: number | null = null;
    let demandStatus: ShadowMarketSnapshot['derived']['demandStatus'] = 'DATA_UNAVAILABLE';

    if (previousSnapshot) {
      if (volume !== null && previousSnapshot.market.volume !== null) {
        volumeGrowth = Number((volume - previousSnapshot.market.volume).toFixed(2));
      }
      if (liquidity !== null && previousSnapshot.market.liquidity !== null) {
        liquidityDelta = Number((liquidity - previousSnapshot.market.liquidity).toFixed(2));
      }
      if (price !== null && previousSnapshot.market.price !== null && previousSnapshot.market.price > 0) {
        priceAccelerationPct = Number((((price - previousSnapshot.market.price) / previousSnapshot.market.price) * 100).toFixed(2));
      }

      // Check demand divergence
      if (priceAccelerationPct !== null && volumeGrowth !== null) {
        if (priceAccelerationPct > 5.0 && volumeGrowth > 0) {
          demandStatus = 'DEMAND_CONFIRMED';
        } else if (priceAccelerationPct > 5.0 && volumeGrowth <= 0) {
          demandStatus = 'DEMAND_DIVERGENCE';
        }
      }
    }

    // Buyer Ratio
    const buyerRatio = (buyVolume !== null && sellVolume !== null && (buyVolume + sellVolume) > 0)
      ? Number((buyVolume / (buyVolume + sellVolume)).toFixed(4))
      : null;

    const snapshot: ShadowMarketSnapshot = {
      token: symbol,
      contract,
      observedAt: nowIso,
      elapsedSeconds,
      discoveryType,
      market: {
        price,
        marketCap,
        liquidity,
        volume,
        liquidityMcRatio,
        estimatedPriceImpact,
      },
      flow: {
        buyVolume,
        sellVolume,
        buyerRatio,
        transactionCount: swaps,
      },
      wallet: {
        uniqueBuyers: null, // ONLY real if provided by endpoint, else strictly null
        uniqueSellers: null,
        holderCount,
        botRatio,
        entrapmentRatio,
        bundlerWallets,
      },
      availability: {
        historical: Boolean(rawToken.isHistorical),
        decisionTimeAvailable: elapsedSeconds <= 60 ? 'AVAILABLE_AT_DECISION' : 'POST_DECISION',
      },
      derived: {
        buyerGrowth,
        volumeGrowth,
        priceAccelerationPct,
        liquidityDelta,
        demandStatus,
      },
    };

    // Save snapshot
    const snapFile = path.join(this.snapshotsDir, `${contract}_${elapsedSeconds}s.json`);
    fs.writeFileSync(snapFile, JSON.stringify(snapshot, null, 2), 'utf8');

    // Update Profile
    profile.snapshotsCount += 1;
    profile.lastSnapshotAt = nowIso;

    // Decision at T0 or early stage (T <= 60s)
    if (!profile.decision && elapsedSeconds <= 60) {
      const decisionObj = this.generateShadowDecision(snapshot);
      profile.decision = decisionObj.decision;
      
      const decisionFile = path.join(this.decisionsDir, `${contract}.json`);
      fs.writeFileSync(decisionFile, JSON.stringify(decisionObj, null, 2), 'utf8');

      // If early buy candidate, open hypothetical $1 position
      if (decisionObj.decision === 'EARLY_BUY_CANDIDATE' && price && price > 0) {
        profile.hypotheticalPosition = {
          contract,
          tokenSymbol: symbol,
          entryAmountUsd: 1.0,
          entryTime: nowIso,
          entryPrice: price,
          entryMarketCap: marketCap || 0,
          entryLiquidity: liquidity || 0,
          currentPrice: price,
          currentPnlPct: 0,
          maxGainPct: 0,
          maxDrawdownPct: 0,
          targetObserved: false,
          targetExecutable: 'UNKNOWN',
          reachedPlus50: false,
          reachedPlus100: false,
          reachedPlus138: false,
          reachedPlus150: false,
          reachedPlus200: false,
          reachedMinus10: false,
          reachedMinus20: false,
          reachedMinus30: false,
          reachedMinus50: false,
          reachedMinus80: false,
          collapsed: false,
        };
      }
    }

    // Update hypothetical position if open
    if (profile.hypotheticalPosition && price && price > 0) {
      const pos = profile.hypotheticalPosition;
      pos.currentPrice = price;
      const gainPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
      pos.currentPnlPct = Number(gainPct.toFixed(2));

      if (gainPct > pos.maxGainPct) {
        pos.maxGainPct = Number(gainPct.toFixed(2));
      }
      if (gainPct < pos.maxDrawdownPct) {
        pos.maxDrawdownPct = Number(gainPct.toFixed(2));
      }

      // Milestones
      if (gainPct >= 50) pos.reachedPlus50 = true;
      if (gainPct >= 100) pos.reachedPlus100 = true;
      if (gainPct >= 138) {
        pos.reachedPlus138 = true;
        if (!pos.targetObserved) {
          pos.targetObserved = true;
          pos.targetObservedTime = nowIso;
          // Target Executable cannot be assumed 'YES' from candle high or snapshot price alone.
          // Requires actual execution/depth confirmation.
          pos.targetExecutable = 'UNKNOWN';
        }
      }
      if (gainPct >= 150) pos.reachedPlus150 = true;
      if (gainPct >= 200) pos.reachedPlus200 = true;
      if (gainPct <= -10) pos.reachedMinus10 = true;
      if (gainPct <= -20) pos.reachedMinus20 = true;
      if (gainPct <= -30) pos.reachedMinus30 = true;
      if (gainPct <= -50) pos.reachedMinus50 = true;
      if (gainPct <= -80) {
        pos.reachedMinus80 = true;
        pos.collapsed = true;
      }

      // Post-event classification after 30 minutes (1800s)
      if (elapsedSeconds >= 1800 && !profile.outcomeClass) {
        if (pos.reachedPlus138 && !pos.collapsed) {
          profile.outcomeClass = 'TRUE_RUNNER';
        } else if (pos.reachedPlus50 && pos.collapsed) {
          profile.outcomeClass = 'EARLY_SPIKE_THEN_DUMP';
        } else if (pos.collapsed && !pos.reachedPlus50) {
          profile.outcomeClass = 'DIRECT_DUMP';
        } else {
          profile.outcomeClass = 'CHOP';
        }
        pos.finalOutcomeClass = profile.outcomeClass;

        const outcomeFile = path.join(this.outcomesDir, `${contract}.json`);
        fs.writeFileSync(outcomeFile, JSON.stringify({
          contract,
          symbol,
          firstObservedAt: profile.firstObservedAt,
          outcomeClass: profile.outcomeClass,
          positionOutcome: pos,
          evaluatedAt: nowIso,
        }, null, 2), 'utf8');
      }
    }

    fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf8');
    return snapshot;
  }

  /**
   * Evaluates shadow research decision strictly based on available data at decision time
   */
  public generateShadowDecision(snapshot: ShadowMarketSnapshot): ShadowResearchDecision {
    const reasons: string[] = [];
    let availableCount = 0;
    let unavailableCount = 0;

    const mc = snapshot.market.marketCap;
    const liq = snapshot.market.liquidity;
    const price = snapshot.market.price;

    if (mc !== null) availableCount++; else unavailableCount++;
    if (liq !== null) availableCount++; else unavailableCount++;
    if (price !== null) availableCount++; else unavailableCount++;
    if (snapshot.flow.buyerRatio !== null) availableCount++; else unavailableCount++;
    if (snapshot.wallet.botRatio !== null) availableCount++; else unavailableCount++;

    if (mc === null || liq === null || price === null) {
      return {
        contract: snapshot.contract,
        tokenSymbol: snapshot.token,
        decidedAt: snapshot.observedAt,
        decision: 'DATA_INSUFFICIENT',
        reasons: ['Temel fiyat veya likidite verisi eksik'],
        observedMarketCap: mc,
        observedLiquidity: liq,
        availableFeaturesCount: availableCount,
        unavailableFeaturesCount: unavailableCount,
      };
    }

    // Late discovery reject
    if (mc >= 50000) {
      reasons.push(`Market Cap $50K üzerinde ($${mc.toLocaleString()}) - Geç Keşif (LATE_DISCOVERY)`);
      return {
        contract: snapshot.contract,
        tokenSymbol: snapshot.token,
        decidedAt: snapshot.observedAt,
        decision: 'REJECT',
        reasons,
        observedMarketCap: mc,
        observedLiquidity: liq,
        availableFeaturesCount: availableCount,
        unavailableFeaturesCount: unavailableCount,
      };
    }

    // Liquidity sanity check
    if (liq < 2000) {
      reasons.push(`Likidite çok sığ ($${liq.toLocaleString()}) - Yüksek slippage riski`);
      return {
        contract: snapshot.contract,
        tokenSymbol: snapshot.token,
        decidedAt: snapshot.observedAt,
        decision: 'WATCH',
        reasons,
        observedMarketCap: mc,
        observedLiquidity: liq,
        availableFeaturesCount: availableCount,
        unavailableFeaturesCount: unavailableCount,
      };
    }

    // Check candidate criteria: $2K-$10K MC, Liquidity >= $2K, buyerRatio >= 0.60
    const buyerRatio = snapshot.flow.buyerRatio || 0;
    if (mc >= 1000 && mc <= 15000 && liq >= 2000 && (buyerRatio >= 0.60 || buyerRatio === 0)) {
      reasons.push(`Hedef erken aşama ($${mc.toLocaleString()} MC), yeterli likidite ($${liq.toLocaleString()})`);
      return {
        contract: snapshot.contract,
        tokenSymbol: snapshot.token,
        decidedAt: snapshot.observedAt,
        decision: 'EARLY_BUY_CANDIDATE',
        reasons,
        observedMarketCap: mc,
        observedLiquidity: liq,
        availableFeaturesCount: availableCount,
        unavailableFeaturesCount: unavailableCount,
      };
    }

    return {
      contract: snapshot.contract,
      tokenSymbol: snapshot.token,
      decidedAt: snapshot.observedAt,
      decision: 'WATCH',
      reasons: ['Bekleme kriterinde'],
      observedMarketCap: mc,
      observedLiquidity: liq,
      availableFeaturesCount: availableCount,
      unavailableFeaturesCount: unavailableCount,
    };
  }

  /**
   * Generates aggregate summary of all tracked shadow tokens
   */
  public getCollectorSummary(): any {
    const tokenFiles = fs.readdirSync(this.tokensDir).filter(f => f.endsWith('.json'));
    const totalTokens = tokenFiles.length;
    let earlyCount = 0;
    let lateCount = 0;
    let candidatesCount = 0;
    let watchCount = 0;
    let rejectCount = 0;
    let targetHitsCount = 0;
    let collapsedCount = 0;

    const tokensList: ShadowTokenProfile[] = [];

    for (const file of tokenFiles) {
      try {
        const p: ShadowTokenProfile = JSON.parse(fs.readFileSync(path.join(this.tokensDir, file), 'utf8'));
        tokensList.push(p);
        if (p.discoveryType === 'EARLY_DISCOVERY') earlyCount++; else lateCount++;
        if (p.decision === 'EARLY_BUY_CANDIDATE') candidatesCount++;
        else if (p.decision === 'WATCH') watchCount++;
        else if (p.decision === 'REJECT') rejectCount++;

        if (p.hypotheticalPosition?.reachedPlus138) targetHitsCount++;
        if (p.hypotheticalPosition?.collapsed) collapsedCount++;
      } catch (e) {}
    }

    const summary = {
      timestamp: new Date().toISOString(),
      mode: 'AVCI_V2_SHADOW',
      totalTokensTracked: totalTokens,
      earlyDiscoveryCount: earlyCount,
      lateDiscoveryCount: lateCount,
      decisions: {
        earlyBuyCandidate: candidatesCount,
        watch: watchCount,
        reject: rejectCount,
      },
      hypotheticalTrading: {
        totalPositions: candidatesCount,
        targetHitCount: targetHitsCount,
        collapsedCount,
      },
      tokens: tokensList.slice(0, 100),
    };

    fs.writeFileSync(path.join(this.baseDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    return summary;
  }
}
