export type ExecutionMode = 'PAPER_TRADING' | 'LIVE_EXECUTION';

export interface ScannedToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  initialLiquidityUsd?: number;
  volume1m: number;
  volume5m: number;
  buyVolume1m?: number;
  sellVolume1m?: number;
  buyVolumeRatio1m?: number; // 0 to 1 based on buy_volume_1m / (buy_volume_1m + sell_volume_1m)
  priceChange1m: number;
  priceChange5m: number;
  swaps1m: number;
  buyRatio1m: number; // 0 to 1 based on transaction count
  continuationProbability: number; // 0 to 100
  continuationVerdict: 'HIGH_CONTINUATION' | 'MODERATE' | 'LOW_EXHAUSTED';
  security: {
    isHoneypot: boolean;
    renouncedMint: boolean;
    top10HolderRate: number;
    buyTax: number;
    sellTax: number;
    top70SniperHoldRate?: number;
    botDegenRate?: number;
  };
  smartMoneyInflowUsd: number;
  poolCreatedAt: number;
  firstDetectedAt?: number;
  waitingFor5mCandle?: boolean;
  timeRemaining5mMs?: number;
  tokenStage?: 'NEW_ENTRY' | 'SATURATED_HIGH_CAP' | 'RISKY';
  isNewOpportunity?: boolean;
  iouMatch?: 'TAM' | 'KISMİ' | 'DIŞI';
  iouMatchDetails?: string;
  actionTaken?: 'BOUGHT' | 'SKIPPED' | 'MONITORING';
  decisionReason?: string;
  shouldBuy?: boolean;
}

export interface TradeCostDetails {
  gmgnBuyFeeUsd: number; // 1% of BUY USDT amount
  gmgnSellFeeUsd: number; // 1% of SELL gross USDT amount
  buyGasUsd: number | null; // Real BUY gas if available from on-chain/GMGN quote, null if unknown
  sellGasUsd: number | null; // Real SELL gas if available from on-chain/GMGN quote, null if unknown
  buyTaxRate: number | null; // Real buy tax from GMGN token security
  buyTaxUsd: number | null; // Buy tax amount
  sellTaxRate: number | null; // Real sell tax from GMGN token security
  sellTaxUsd: number | null; // Sell tax amount
  slippageBuyPercent: number | null; // Realized slippage on buy if available
  slippageSellPercent: number | null; // Realized slippage on sell if available
  totalKnownCostsUsd: number;
}

export interface ActivePosition {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  entryPriceUsd: number;
  currentPriceUsd: number;
  usdtInvested: number;
  tokensHeld: number;
  entryTime: number;
  unrealizedGrossPnlPercent: number;
  unrealizedGrossPnlUsd: number;
  unrealizedNetPnlPercent: number;
  unrealizedNetPnlUsd: number;
  // Kept for backward compatibility
  unrealizedPnlPercent: number;
  unrealizedPnlUsd: number;
  costs: TradeCostDetails;
  momentumStatus: 'strong' | 'weakening' | 'exhausted';
  latestAnalysis: string;
  maxNetPnlPercentReached?: number;
  profitProtectionActive?: boolean;
  profitProtectionActivatedAt?: number;
}

export interface ExecutedTrade {
  id: string;
  timestamp: number;
  action: 'BUY' | 'SELL';
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  priceUsd: number;
  usdtAmount: number;
  tokenAmount: number;
  grossPnlPercent?: number;
  grossPnlUsd?: number;
  netPnlPercent?: number;
  netPnlUsd?: number;
  costs?: TradeCostDetails;
  // Kept for backward compatibility
  pnlPercent?: number;
  pnlUsd?: number;
  reason: string;
  continuationScoreAtTrade: number;
  telegramNotified: boolean;
}

export interface BotState {
  isRunning: boolean;
  mode: ExecutionMode;
  chainId: number;
  chainName: string;
  chainSlug: string;
  balanceUsdt: number;
  initialBalanceUsdt: number;
  tradeAmountUsdt: number;
  activePositions: ActivePosition[];
  scannedTokens: ScannedToken[];
  tradeHistory: ExecutedTrade[];
  lastScanTime: number;
  radarStatus?: {
    success: boolean;
    source: string;
    tokenCount: number;
    error: string | null;
    lastFetchTime: number;
    lastSuccessTime?: number;
  };
  stats: {
    totalTrades: number;
    profitableTrades: number;
    lossTrades: number;
    totalProfitUsd: number;
    winRate: number;
  };
}

export interface VerificationItem {
  id: number;
  title: string;
  topic: string;
  status: 'VERIFIED' | 'CODE_READY' | 'NOT_TESTED';
  description: string;
  diagnosticNote: string;
}

export interface GMGNConfig {
  apiKey?: string;
  privateKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  mode: ExecutionMode;
  chainId: number;
  chainSlug: string;
}
