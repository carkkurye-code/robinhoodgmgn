import fs from 'node:fs';
import path from 'node:path';
import { GMGNService } from './gmgnService.js';
import { AnalysisEngine } from './analysisEngine.js';
import { TelegramService } from './telegramService.js';
import type { BotState, ScannedToken, ActivePosition, ExecutedTrade, ExecutionMode, GMGNConfig, TradeCostDetails } from './types.js';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'server', 'bot-settings.json');

function loadSavedTradeAmount(): number {
  return 1;
}

function saveTradeAmount(amount: number) {
  try {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existingData: Record<string, any> = {};
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      try {
        existingData = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8'));
      } catch {}
    }
    existingData.tradeAmountUsdt = 1;
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(existingData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TradingEngine] İşlem miktarı kaydedilemedi:', err);
  }
}

export class TradingEngine {
  private gmgnService: GMGNService;
  private analysisEngine: AnalysisEngine;
  private telegramService: TelegramService;

  private state: BotState;
  private loopInterval: NodeJS.Timeout | null = null;
  private tradeCounter = 0;
  private sessionTradedTokens: Set<string> = new Set();
  // Token radar ilk tespit zamanı: tokenAddress (küçük harf) -> timestamp (ms)
  private tokenFirstDetectedTimes: Map<string, number> = new Map();

  constructor(config: GMGNConfig) {
    this.gmgnService = new GMGNService(config);
    this.analysisEngine = new AnalysisEngine();
    this.telegramService = new TelegramService(config.telegramBotToken, config.telegramChatId);

    const initialTradeAmount = loadSavedTradeAmount();

    this.state = {
      isRunning: false,
      mode: 'PAPER_TRADING', // Safe default: Paper trading
      chainId: 4663,
      chainName: 'Robinhood Chain',
      chainSlug: 'rh',
      balanceUsdt: 500,
      initialBalanceUsdt: 500,
      tradeAmountUsdt: initialTradeAmount,
      activePositions: [],
      scannedTokens: [],
      tradeHistory: [],
      lastScanTime: 0,
      stats: {
        totalTrades: 0,
        profitableTrades: 0,
        lossTrades: 0,
        totalProfitUsd: 0,
        winRate: 0,
      },
    };

    // Start polling Telegram commands (/5, /10, /7, etc.)
    this.telegramService.startPolling(
      (newAmount: number) => {
        this.setTradeAmount(newAmount);
      },
      () => this.getTradeAmount()
    );
  }

  public getState(): BotState {
    return this.state;
  }

  public updateConfig(config: Partial<GMGNConfig>) {
    this.gmgnService.updateConfig(config);
    if (config.telegramBotToken || config.telegramChatId) {
      this.telegramService.updateCredentials(config.telegramBotToken, config.telegramChatId);
      this.telegramService.startPolling(
        (newAmount: number) => {
          this.setTradeAmount(newAmount);
        },
        () => this.getTradeAmount()
      );
    }
    if (config.mode) {
      // PAPER_TRADING dışında gerçek para ile işlem yapılmayacak
      this.state.mode = 'PAPER_TRADING';
    }
  }

  public start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log('TradingEngine started on Robinhood Chain (4663)...');

    // Run first iteration immediately
    this.runCycle().catch((err) => console.error('Cycle error:', err));

    // Poll every 10 seconds to keep active positions and stop-loss checks responsive
    this.loopInterval = setInterval(() => {
      this.runCycle().catch((err) => console.error('Cycle error:', err));
    }, 10000);
  }

  public stop() {
    this.state.isRunning = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    console.log('TradingEngine stopped.');
  }

  public reset() {
    this.stop();
    this.tradeCounter = 0;
    this.sessionTradedTokens.clear();
    this.state.isRunning = false;
    this.state.mode = 'PAPER_TRADING';
    this.state.balanceUsdt = 500;
    this.state.initialBalanceUsdt = 500;
    this.state.activePositions = [];
    this.state.tradeHistory = [];
    this.state.stats = {
      totalTrades: 0,
      profitableTrades: 0,
      lossTrades: 0,
      totalProfitUsd: 0,
      winRate: 0,
    };
    console.log('[TradingEngine] PAPER_TRADING oturumu ve tüm işlem durumları temizlendi.');
  }

  public async runCycle() {
    this.state.lastScanTime = Date.now();

    // Check Telegram commands (/5, /10, etc.) before evaluating
    await this.telegramService.pollUpdates();

    // 1. Fetch scanned tokens on Robinhood Chain
    const rawTokens = await this.gmgnService.fetchRobinhoodTokens();
    const radarInfo = this.gmgnService.getRadarStatus();
    this.state.radarStatus = radarInfo;

    if (rawTokens.length > 0) {
      console.log(`[GMGN Radar]: Robinhood Chain (4663) üzerinden ${rawTokens.length} adet gerçek token başarıyla çekildi.`);
    } else {
      console.warn(`[GMGN Radar]: Gerçek veri alınamadı veya liste boş. Hata: ${radarInfo.error || 'Veri bulunamadı'}`);
    }

    // 2. Run Dynamic Continuation & IOU Opportunity Analysis on each token
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const now = Date.now();

    const evaluatedTokens: ScannedToken[] = rawTokens.map((token) => {
      const tokenAddressLower = token.address.toLowerCase();

      // Radar ilk tespit zamanını kaydet (mevcut değilse şu anki zamanı ata)
      if (!this.tokenFirstDetectedTimes.has(tokenAddressLower)) {
        this.tokenFirstDetectedTimes.set(tokenAddressLower, now);
      }
      const firstDetectedAt = this.tokenFirstDetectedTimes.get(tokenAddressLower)!;
      const elapsedMs = now - firstDetectedAt;
      const isFiveMinutesCompleted = elapsedMs >= FIVE_MINUTES_MS;
      const timeRemaining5mMs = isFiveMinutesCompleted ? 0 : (FIVE_MINUTES_MS - elapsedMs);

      const evaluation = this.analysisEngine.evaluateToken(token);
      const isAlreadyTradedInSession =
        this.sessionTradedTokens.has(tokenAddressLower) ||
        this.state.tradeHistory.some((th) => th.tokenAddress.toLowerCase() === tokenAddressLower);

      if (isAlreadyTradedInSession) {
        return {
          ...token,
          firstDetectedAt,
          waitingFor5mCandle: false,
          timeRemaining5mMs: 0,
          continuationProbability: evaluation.score,
          continuationVerdict: evaluation.verdict,
          decisionReason: 'Token bu oturumda daha önce alınıp işlem gördü. Radar sonuçlarında tekrar listelenmesi yeni fırsat olarak sayılmaz (Tekrar alım engellendi).',
          tokenStage: evaluation.tokenStage,
          isNewOpportunity: false,
          iouMatch: 'DIŞI' as const,
          iouMatchDetails: 'Oturumda işlem görmüş token (Yeniden alım engellendi)',
          shouldBuy: false,
        };
      }

      return {
        ...token,
        firstDetectedAt,
        waitingFor5mCandle: false,
        timeRemaining5mMs: 0,
        continuationProbability: evaluation.score,
        continuationVerdict: evaluation.verdict,
        decisionReason: evaluation.reason,
        tokenStage: evaluation.tokenStage,
        isNewOpportunity: evaluation.isNewOpportunity,
        iouMatch: evaluation.iouMatch,
        iouMatchDetails: evaluation.iouMatchDetails,
        shouldBuy: evaluation.shouldBuy,
      };
    });

    this.state.scannedTokens = evaluatedTokens;

    // 3. Monitor Active Positions & Evaluate Dynamic Exits (Sadece bot çalışıyorken)
    if (this.state.isRunning && this.state.activePositions.length > 0) {
      await this.checkActivePositions(evaluatedTokens);
    }

    // 4. AnalysisEngine alım onayı almış tokenlardan maksimum 10 aktif pozisyona kadar 1 USDT paper alım yapılır
    // Stop-loss tamamen kaldırılmıştır; pozisyon satış sinyali gelene kadar açık kalır.
    const buyAmount = 1; // Her token için maksimum ayrılan alım miktarı 1 USDT
    const MAX_ACTIVE_POSITIONS = 10;

    if (this.state.isRunning && this.state.activePositions.length < MAX_ACTIVE_POSITIONS && this.state.balanceUsdt >= buyAmount) {
      // AnalysisEngine evaluateToken() tarafından alım onayı verilmiş (shouldBuy === true) adayları belirle
      const buyCandidates = evaluatedTokens.filter((token) => {
        const tokenAddressLower = token.address.toLowerCase();
        const isHolding = this.state.activePositions.some((p) => p.tokenAddress.toLowerCase() === tokenAddressLower);
        if (isHolding) return false;

        const isAlreadyTradedInSession =
          this.sessionTradedTokens.has(tokenAddressLower) ||
          this.state.tradeHistory.some((th) => th.tokenAddress.toLowerCase() === tokenAddressLower);
        if (isAlreadyTradedInSession) return false;

        // AnalysisEngine alım onayı şartı (shouldBuy === true)
        return token.shouldBuy === true;
      }).sort((a, b) => {
        // En yüksek potansiyelli ve dinamik skoru olan onaylı tokenları önceliklendir
        const aTam = a.iouMatch === 'TAM' ? 1 : 0;
        const bTam = b.iouMatch === 'TAM' ? 1 : 0;
        if (aTam !== bTam) return bTam - aTam;
        return b.continuationProbability - a.continuationProbability;
      });

      // 10 açık pozisyona ulaşana kadar onaylanan adaylardan 1 USDT paper alım yap
      for (const candidate of buyCandidates) {
        if (this.state.activePositions.length >= MAX_ACTIVE_POSITIONS) {
          break;
        }
        if (this.state.balanceUsdt < buyAmount) {
          break;
        }

        let latestCandidate = candidate;
        try {
          const freshToken = await this.gmgnService.fetchTokenByAddress(candidate.address, true);
          if (freshToken) {
            // Radar'dan gelen 1m/5m ivme ve ilk tespit zamanı verilerini koru (single-token endpoint 0 dönerse)
            if (freshToken.priceChange1m === 0 && candidate.priceChange1m !== 0) {
              freshToken.priceChange1m = candidate.priceChange1m;
            }
            if (freshToken.priceChange5m === 0 && candidate.priceChange5m !== 0) {
              freshToken.priceChange5m = candidate.priceChange5m;
            }
            if (freshToken.volume5m === 0 && candidate.volume5m !== 0) {
              freshToken.volume5m = candidate.volume5m;
            }
            freshToken.firstDetectedAt = candidate.firstDetectedAt;
            latestCandidate = freshToken;
          }
        } catch {}

        // BUY aşamasında GMGN'den alınan güncel token verisi de mevcut AnalysisEngine.evaluateToken() üzerinden TEKRAR değerlendirilir:
        const freshEvaluation = this.analysisEngine.evaluateToken(latestCandidate);

        // Güncel analiz sonuçlarını token nesnesine aktar
        latestCandidate.continuationProbability = freshEvaluation.score;
        latestCandidate.continuationVerdict = freshEvaluation.verdict;
        latestCandidate.decisionReason = freshEvaluation.reason;
        latestCandidate.tokenStage = freshEvaluation.tokenStage;
        latestCandidate.isNewOpportunity = freshEvaluation.isNewOpportunity;
        latestCandidate.iouMatch = freshEvaluation.iouMatch;
        latestCandidate.iouMatchDetails = freshEvaluation.iouMatchDetails;
        latestCandidate.shouldBuy = freshEvaluation.shouldBuy;

        // AnalysisEngine güncel veride alımı onaylamıyorsa BUY yapılmaz, sonraki adaya geçilir
        if (!freshEvaluation.shouldBuy) {
          console.log(`[BUY Pas Geçildi] ${latestCandidate.symbol} güncel analizde onay alamadı: ${freshEvaluation.reason}`);
          continue;
        }

        const calculatedScore = freshEvaluation.score;

        await this.executeBuy(
          latestCandidate,
          buyAmount,
          `1 USDT Yeni Token Deneme Stratejisi: Erken giriş fırsatı (Skor: %${calculatedScore}, Alıcı: %${Math.round(latestCandidate.buyRatio1m * 100)})`,
          calculatedScore
        );
      }
    }
  }

  private async checkActivePositions(marketTokens: ScannedToken[]) {
    const remainingPositions: ActivePosition[] = [];

    for (const pos of this.state.activePositions) {
      // For active positions (SELL & Stop-Loss evaluation), query fresh live on-chain GMGN data
      // directly by contract address (bypassCache=true) to eliminate general radar cache delays
      let marketToken: ScannedToken | undefined = undefined;
      try {
        const liveToken = await this.gmgnService.fetchTokenByAddress(pos.tokenAddress, true);
        if (liveToken) {
          marketToken = liveToken;
        }
      } catch (err) {
        console.warn(`GMGN live address query failed for ${pos.tokenAddress}:`, err);
      }

      // Fallback to trending marketTokens or pos.currentPriceUsd if live single query fails
      if (!marketToken) {
        marketToken = marketTokens.find(
          (t) => t.address.toLowerCase() === pos.tokenAddress.toLowerCase()
        );
      }

      // Update current price & unrealized PnL
      const currentPrice = marketToken ? marketToken.priceUsd : pos.currentPriceUsd;
      pos.currentPriceUsd = currentPrice;
      const currentValueUsd = pos.tokensHeld * currentPrice;
      
      // Gross PnL
      const grossPnlUsd = currentValueUsd - pos.usdtInvested;
      const grossPnlPercent = (grossPnlUsd / pos.usdtInvested) * 100;
      pos.unrealizedGrossPnlUsd = grossPnlUsd;
      pos.unrealizedGrossPnlPercent = grossPnlPercent;

      // Net PnL calculation:
      // Known costs:
      // 1) GMGN Buy 1% (already incurred at buy)
      // 2) GMGN Sell 1% (incurred at current liquidation value)
      // 3) Token buy tax (if known from GMGN security)
      // 4) Token sell tax (if known from GMGN security on current value)
      // 5) Gas (if real quote/data exists; otherwise null and not guessed)
      const gmgnBuyFeeUsd = pos.costs?.gmgnBuyFeeUsd ?? (pos.usdtInvested * 0.01);
      const gmgnSellFeeUsd = currentValueUsd * 0.01;
      
      const buyTaxRate = pos.costs?.buyTaxRate ?? (marketToken?.security?.buyTax ?? null);
      const buyTaxUsd = buyTaxRate !== null ? pos.usdtInvested * buyTaxRate : null;
      
      const sellTaxRate = marketToken?.security?.sellTax ?? pos.costs?.sellTaxRate ?? null;
      const sellTaxUsd = sellTaxRate !== null ? currentValueUsd * sellTaxRate : null;

      const buyGasUsd = pos.costs?.buyGasUsd ?? null;
      const sellGasUsd = null; // Real sell gas not available from GMGN read API; kept null without guessing

      const totalKnownCostsUsd =
        gmgnBuyFeeUsd +
        gmgnSellFeeUsd +
        (buyTaxUsd ?? 0) +
        (sellTaxUsd ?? 0) +
        (buyGasUsd ?? 0) +
        (sellGasUsd ?? 0);

      const netPnlUsd = grossPnlUsd - totalKnownCostsUsd;
      const netPnlPercent = (netPnlUsd / pos.usdtInvested) * 100;

      pos.unrealizedNetPnlUsd = netPnlUsd;
      pos.unrealizedNetPnlPercent = netPnlPercent;
      // Backward compatibility: default unrealizedPnl to netPnl
      pos.unrealizedPnlUsd = netPnlUsd;
      pos.unrealizedPnlPercent = netPnlPercent;

      pos.costs = {
        gmgnBuyFeeUsd,
        gmgnSellFeeUsd,
        buyGasUsd,
        sellGasUsd,
        buyTaxRate,
        buyTaxUsd,
        sellTaxRate,
        sellTaxUsd,
        slippageBuyPercent: pos.costs?.slippageBuyPercent ?? null,
        slippageSellPercent: null,
        totalKnownCostsUsd,
      };

      // Zirve kâr takibi (istatistiksel amaçlı)
      if (typeof pos.maxNetPnlPercentReached !== 'number' || netPnlPercent > pos.maxNetPnlPercentReached) {
        pos.maxNetPnlPercentReached = netPnlPercent;
      }

      // Dinamik çıkış kontrolü (Alıcı ivmesi tükenmesi veya Güvenlik anomalisi)
      const exitEvaluation = this.analysisEngine.evaluateExit(pos, marketToken);
      pos.momentumStatus = exitEvaluation.newMomentumStatus;
      pos.latestAnalysis = exitEvaluation.reason;

      if (exitEvaluation.shouldExit) {
        // Execute dynamic exit (Sell)
        await this.executeSell(pos, exitEvaluation.reason);
      } else {
        remainingPositions.push(pos);
      }
    }

    this.state.activePositions = remainingPositions;
  }

  private async executeBuy(token: ScannedToken, usdtAmount: number, reason: string, score: number) {
    const quote = this.gmgnService.getQuote(token.address, usdtAmount, token.priceUsd);
    const tokensBought = Math.round(quote.expectedOut);

    // Calculate real known buy costs:
    // 1) GMGN Buy 1%
    const gmgnBuyFeeUsd = usdtAmount * 0.01;
    // 2) Buy Tax from GMGN security
    const buyTaxRate = token.security?.buyTax ?? null;
    const buyTaxUsd = buyTaxRate !== null ? usdtAmount * buyTaxRate : null;
    // 3) Real buy gas (not guessed - null if not provided from real transaction)
    const buyGasUsd = null; 
    // 4) Buy slippage
    const slippageBuyPercent = quote.effectiveSlippage ?? null;

    // Deduct USDT from balance (invested amount + 1% GMGN fee)
    this.state.balanceUsdt -= (usdtAmount + gmgnBuyFeeUsd);

    const initialCosts: TradeCostDetails = {
      gmgnBuyFeeUsd,
      gmgnSellFeeUsd: 0,
      buyGasUsd,
      sellGasUsd: null,
      buyTaxRate,
      buyTaxUsd,
      sellTaxRate: token.security?.sellTax ?? null,
      sellTaxUsd: null,
      slippageBuyPercent,
      slippageSellPercent: null,
      totalKnownCostsUsd: gmgnBuyFeeUsd + (buyTaxUsd ?? 0),
    };

    const newPosition: ActivePosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      tokenName: token.name,
      entryPriceUsd: token.priceUsd,
      currentPriceUsd: token.priceUsd,
      usdtInvested: usdtAmount,
      tokensHeld: tokensBought,
      entryTime: Date.now(),
      unrealizedGrossPnlPercent: 0,
      unrealizedGrossPnlUsd: 0,
      unrealizedNetPnlPercent: -((initialCosts.totalKnownCostsUsd / usdtAmount) * 100),
      unrealizedNetPnlUsd: -initialCosts.totalKnownCostsUsd,
      unrealizedPnlPercent: -((initialCosts.totalKnownCostsUsd / usdtAmount) * 100),
      unrealizedPnlUsd: -initialCosts.totalKnownCostsUsd,
      costs: initialCosts,
      momentumStatus: 'strong',
      latestAnalysis: reason,
      maxNetPnlPercentReached: -((initialCosts.totalKnownCostsUsd / usdtAmount) * 100),
      profitProtectionActive: false,
    };

    this.state.activePositions.push(newPosition);
    this.sessionTradedTokens.add(token.address.toLowerCase());

    this.tradeCounter++;
    const tradeRecord: ExecutedTrade = {
      id: `trade_buy_${Date.now()}_${this.tradeCounter}`,
      timestamp: Date.now(),
      action: 'BUY',
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      tokenName: token.name,
      priceUsd: token.priceUsd,
      usdtAmount,
      tokenAmount: tokensBought,
      reason,
      continuationScoreAtTrade: score,
      costs: initialCosts,
      telegramNotified: false,
    };

    // Send Telegram notification
    const notified = await this.telegramService.notifyTrade(tradeRecord);
    tradeRecord.telegramNotified = notified;

    this.state.tradeHistory.unshift(tradeRecord);
    if (this.state.tradeHistory.length > 50) this.state.tradeHistory.pop();
  }

  private async executeSell(pos: ActivePosition, reason: string) {
    const returnGrossUsdt = pos.tokensHeld * pos.currentPriceUsd;

    // Real known SELL costs:
    // 1) GMGN Sell fee: 1% of gross proceeds
    const gmgnSellFeeUsd = returnGrossUsdt * 0.01;
    // 2) Sell Tax from GMGN security
    const sellTaxRate = pos.costs?.sellTaxRate ?? null;
    const sellTaxUsd = sellTaxRate !== null ? returnGrossUsdt * sellTaxRate : null;
    // 3) Gas (only if real on-chain/GMGN data available; otherwise null)
    const sellGasUsd = null;

    const gmgnBuyFeeUsd = pos.costs?.gmgnBuyFeeUsd ?? (pos.usdtInvested * 0.01);
    const buyTaxUsd = pos.costs?.buyTaxUsd ?? null;
    const buyGasUsd = pos.costs?.buyGasUsd ?? null;

    const totalKnownCostsUsd =
      gmgnBuyFeeUsd +
      gmgnSellFeeUsd +
      (buyTaxUsd ?? 0) +
      (sellTaxUsd ?? 0) +
      (buyGasUsd ?? 0) +
      (sellGasUsd ?? 0);

    // Balance receives net return (gross proceeds minus GMGN sell fee and sell tax if any)
    const netReturnUsdt = returnGrossUsdt - gmgnSellFeeUsd - (sellTaxUsd ?? 0);
    this.state.balanceUsdt += netReturnUsdt;

    // PnL metrics:
    // Gross: price difference between gross returned and usdtInvested
    const grossPnlUsd = returnGrossUsdt - pos.usdtInvested;
    const grossPnlPercent = (grossPnlUsd / pos.usdtInvested) * 100;

    // Net: gross profit minus all known transaction costs
    const netPnlUsd = grossPnlUsd - totalKnownCostsUsd;
    const netPnlPercent = (netPnlUsd / pos.usdtInvested) * 100;

    const finalCosts: TradeCostDetails = {
      gmgnBuyFeeUsd,
      gmgnSellFeeUsd,
      buyGasUsd,
      sellGasUsd,
      buyTaxRate: pos.costs?.buyTaxRate ?? null,
      buyTaxUsd,
      sellTaxRate,
      sellTaxUsd,
      slippageBuyPercent: pos.costs?.slippageBuyPercent ?? null,
      slippageSellPercent: null,
      totalKnownCostsUsd,
    };

    // Update stats with Net PnL
    this.state.stats.totalTrades += 1;
    if (netPnlUsd >= 0) {
      this.state.stats.profitableTrades += 1;
    } else {
      this.state.stats.lossTrades += 1;
    }
    this.state.stats.totalProfitUsd += netPnlUsd;
    this.state.stats.winRate =
      (this.state.stats.profitableTrades / this.state.stats.totalTrades) * 100;

    this.tradeCounter++;
    const tradeRecord: ExecutedTrade = {
      id: `trade_sell_${Date.now()}_${this.tradeCounter}`,
      timestamp: Date.now(),
      action: 'SELL',
      tokenAddress: pos.tokenAddress,
      tokenSymbol: pos.tokenSymbol,
      tokenName: pos.tokenName,
      priceUsd: pos.currentPriceUsd,
      usdtAmount: Number(returnGrossUsdt.toFixed(2)),
      tokenAmount: pos.tokensHeld,
      grossPnlPercent: Number(grossPnlPercent.toFixed(2)),
      grossPnlUsd: Number(grossPnlUsd.toFixed(2)),
      netPnlPercent: Number(netPnlPercent.toFixed(2)),
      netPnlUsd: Number(netPnlUsd.toFixed(2)),
      costs: finalCosts,
      // Default pnl to net PnL
      pnlPercent: Number(netPnlPercent.toFixed(2)),
      pnlUsd: Number(netPnlUsd.toFixed(2)),
      reason,
      continuationScoreAtTrade: 40,
      telegramNotified: false,
    };

    // Send Telegram notification
    const notified = await this.telegramService.notifyTrade(tradeRecord);
    tradeRecord.telegramNotified = notified;

    this.state.tradeHistory.unshift(tradeRecord);
    if (this.state.tradeHistory.length > 50) this.state.tradeHistory.pop();
  }

  public getGMGNService(): GMGNService {
    return this.gmgnService;
  }

  public getTelegramService(): TelegramService {
    return this.telegramService;
  }

  public setTradeAmount(amount: number) {
    // 1 USDT deneme stratejisi: her token için maksimum ayrılan alım miktarı 1 USDT
    this.state.tradeAmountUsdt = 1;
    saveTradeAmount(1);
    console.log('[TradingEngine] İşlem miktarı 1 USDT deneme stratejisi kapsamında $1 USDT olarak sabitlendi.');
  }

  public getTradeAmount(): number {
    return 1;
  }

  public getTokenFirstDetectedTime(tokenAddress: string): number | undefined {
    return this.tokenFirstDetectedTimes.get(tokenAddress.toLowerCase());
  }

  public setTokenFirstDetectedTime(tokenAddress: string, timestamp: number): void {
    this.tokenFirstDetectedTimes.set(tokenAddress.toLowerCase(), timestamp);
  }
}
