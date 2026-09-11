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
  buyRatio1m: number;
  continuationProbability: number;
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
  migrationAnalysis?: MigrationValidationResult;
}

export interface MigrationValidationWindow {
  window: '30s' | '1m' | '2m' | '3m' | '5m';
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyUsd: number;
  sellUsd: number;
  netFlow: number;
  buyerRatio: number;
  candleColor: 'GREEN' | 'RED' | 'DOJI';
  priceChangeVsT0: number;
}

export interface MigrationValidationResult {
  migrationDetected: boolean;
  migrationTimestamp?: number;
  t0Price?: number;
  status: 'MIGRATION_STRONG' | 'MIGRATION_NEUTRAL' | 'MIGRATION_RISKY' | 'NOT_MIGRATED' | 'MIGRATION_DATA_UNAVAILABLE';
  statusBadge: string;
  riskScore: number;
  netFlow1m: number;
  netFlow2m: number;
  netFlow3m: number;
  buyerRatio1m: number;
  buyUsd1m: number;
  sellUsd1m: number;
  volume1m: number;
  isSpikeTrap: boolean;
  reasons: string[];
  windows: Record<string, MigrationValidationWindow>;
  disclaimer: string;
  analyzedAt: number;
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
  migrationAnalysis?: MigrationValidationResult;
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
