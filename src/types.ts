export type ExecutionMode = 'PAPER_TRADING' | 'LIVE_EXECUTION';

export interface ScannedToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume1m: number;
  volume5m: number;
  priceChange1m: number;
  priceChange5m: number;
  swaps1m: number;
  buyRatio1m: number;
  continuationProbability: number;
  continuationVerdict: 'HIGH_CONTINUATION' | 'MODERATE' | 'LOW_EXHAUSTED';
  security: {
    isHoneypot: boolean;
    renouncedMint: boolean;
    top10HolderRate: number;
    buyTax: number;
    sellTax: number;
  };
  smartMoneyInflowUsd: number;
  poolCreatedAt: number;
  tokenStage?: 'NEW_ENTRY' | 'SATURATED_HIGH_CAP' | 'RISKY';
  isNewOpportunity?: boolean;
  iouMatch?: 'TAM' | 'KISMİ' | 'DIŞI';
  iouMatchDetails?: string;
  actionTaken?: 'BOUGHT' | 'SKIPPED' | 'MONITORING';
  decisionReason?: string;
}

export interface TradeCostDetails {
  gmgnBuyFeeUsd: number;
  gmgnSellFeeUsd: number;
  buyGasUsd: number | null;
  sellGasUsd: number | null;
  buyTaxRate: number | null;
  buyTaxUsd: number | null;
  sellTaxRate: number | null;
  sellTaxUsd: number | null;
  slippageBuyPercent: number | null;
  slippageSellPercent: number | null;
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
  unrealizedGrossPnlPercent?: number;
  unrealizedGrossPnlUsd?: number;
  unrealizedNetPnlPercent?: number;
  unrealizedNetPnlUsd?: number;
  unrealizedPnlPercent: number;
  unrealizedPnlUsd: number;
  costs?: TradeCostDetails;
  momentumStatus: 'strong' | 'weakening' | 'exhausted';
  latestAnalysis: string;
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
  tradeAmountUsdt?: number;
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
