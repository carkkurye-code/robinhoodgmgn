import { GMGNService } from './gmgnService.js';
import { AnalysisEngine } from './analysisEngine.js';
import { TelegramService } from './telegramService.js';
import type { BotState, ScannedToken, ActivePosition, ExecutedTrade, ExecutionMode, GMGNConfig, TradeCostDetails } from './types.js';

export class TradingEngine {
  private gmgnService: GMGNService;
  private analysisEngine: AnalysisEngine;
  private telegramService: TelegramService;

  private state: BotState;
  private loopInterval: NodeJS.Timeout | null = null;

  constructor(config: GMGNConfig) {
    this.gmgnService = new GMGNService(config);
    this.analysisEngine = new AnalysisEngine();
    this.telegramService = new TelegramService(config.telegramBotToken, config.telegramChatId);

    this.state = {
      isRunning: false,
      mode: 'PAPER_TRADING', // Safe default: Paper trading
      chainId: 4663,
      chainName: 'Robinhood Chain',
      chainSlug: 'rh',
      balanceUsdt: 500,
      initialBalanceUsdt: 500,
      tradeAmountUsdt: 50,
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
      // Keep live mode strictly safe
      this.state.mode = config.mode;
    }
  }

  public start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log('TradingEngine started on Robinhood Chain (4663)...');

    // Run first iteration immediately
    this.runCycle().catch((err) => console.error('Cycle error:', err));

    // Poll every 20 seconds to prevent GMGN rate limiting
    this.loopInterval = setInterval(() => {
      this.runCycle().catch((err) => console.error('Cycle error:', err));
    }, 20000);
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
  }

  public async runCycle() {
    this.state.lastScanTime = Date.now();

    // Check Telegram commands (/5, /10, etc.) before evaluating
    await this.telegramService.pollUpdates();

    // 1. Fetch scanned tokens on Robinhood Chain
    const rawTokens = await this.gmgnService.fetchRobinhoodTokens();

    // 2. Run Dynamic Continuation Analysis on each token
    const evaluatedTokens: ScannedToken[] = rawTokens.map((token) => {
      const evaluation = this.analysisEngine.evaluateToken(token);
      return {
        ...token,
        continuationProbability: evaluation.score,
        continuationVerdict: evaluation.verdict,
        decisionReason: evaluation.reason,
      };
    });

    this.state.scannedTokens = evaluatedTokens;

    // 3. Monitor Active Positions & Evaluate Dynamic Exits
    await this.checkActivePositions(evaluatedTokens);

    // 4. Evaluate Dynamic Buy Opportunities (Max 3 open positions)
    const buyAmount = this.state.tradeAmountUsdt || 50;
    if (this.state.activePositions.length < 3 && this.state.balanceUsdt >= buyAmount) {
      for (const token of evaluatedTokens) {
        // Must not already be holding
        const isHolding = this.state.activePositions.some((p) => p.tokenAddress === token.address);
        if (isHolding) continue;

        const evalResult = this.analysisEngine.evaluateToken(token);
        if (evalResult.shouldBuy) {
          await this.executeBuy(token, buyAmount, evalResult.reason, evalResult.score);
          break; // One buy per cycle to manage risk
        }
      }
    }
  }

  private async checkActivePositions(marketTokens: ScannedToken[]) {
    const remainingPositions: ActivePosition[] = [];

    for (const pos of this.state.activePositions) {
      const marketToken = marketTokens.find((t) => t.address === pos.tokenAddress);

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

      // Dynamic exit check (including -%10.00 Net Stop-Loss)
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
    };

    this.state.activePositions.push(newPosition);

    const tradeRecord: ExecutedTrade = {
      id: `trade_${Date.now()}`,
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

    const tradeRecord: ExecutedTrade = {
      id: `trade_${Date.now()}`,
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
    if (amount > 0 && isFinite(amount)) {
      this.state.tradeAmountUsdt = amount;
      console.log(`[TradingEngine] İşlem miktarı Telegram üzerinden $${amount} USDT olarak güncellendi.`);
    }
  }

  public getTradeAmount(): number {
    return this.state.tradeAmountUsdt || 50;
  }
}
