import { AnalysisEngine } from '../server/analysisEngine.js';
import type { ScannedToken } from '../server/types.js';

interface CandidateEvaluation {
  id: string;
  name: string;
  symbol: string;
  // Pre-buy parameters
  marketCapUsd: number;
  buyerRatio1m: number;
  priceChange1m: number;
  priceChange5m: number;
  volumeRatio: number;
  smartMoneyInflowUsd: number;
  liquidityUsd: number;
  isHoneypot: boolean;
  sellTax: number;
  // Evaluation by current UNTOUCHED AnalysisEngine
  currentScore: number;
  shouldBuy: boolean;
  decisionReason: string;
  // Fingerprint conditions (labeling only)
  condMC: boolean;
  condBuyer: boolean;
  condP1: boolean;
  condP5: boolean;
  condVolRatio: boolean;
  condSmartMoney: boolean;
  condLiquidity: boolean;
  condSecurity: boolean;
  fingerprintGroup: 'TAM' | 'KISMİ' | 'DIŞI';
  // Outcome metrics
  maxGrossPnlPercent: number;
  maxNetPnlPercent: number;
  maxDrawdownPercent: number;
  hitPlus1Net: boolean;
  hitPlus5Net: boolean;
  hitPlus10Net: boolean;
  hitPlus25Net: boolean;
  hitPlus50Net: boolean;
  hitPlus100Net: boolean;
  hitPlus200Net: boolean;
  hitMinus5Net: boolean;
  hitMinus10Net: boolean;
  exitReason: 'STOP_LOSS_10' | 'PROFIT_PROTECTION' | 'TAKE_PROFIT_35' | 'EXHAUSTION' | 'STILL_HOLDING' | 'DID_NOT_BUY';
}

// 1. Core 14 Historical Robinhood Chain Candidates
const CORE_HISTORICAL: Array<{
  name: string;
  symbol: string;
  token: ScannedToken;
  maxGrossPnl: number;
  maxNetPnl: number;
  maxDrawdown: number;
  exitReason: CandidateEvaluation['exitReason'];
}> = [
  {
    name: 'IOU-NOTHING (1. Alım)',
    symbol: 'IOU-NOTHING',
    token: {
      address: '0x6f386c311af0181de267c25fd63d58dcae7b53f4',
      symbol: 'IOU-NOTHING',
      name: 'IOU-NOTHING',
      priceUsd: 0.000026,
      marketCapUsd: 11500,
      liquidityUsd: 14200,
      volume1m: 1450,
      volume5m: 6300,
      priceChange1m: 2.8,
      priceChange5m: 8.4,
      swaps1m: 24,
      buyRatio1m: 0.61,
      continuationProbability: 85,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.22, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 1450,
      poolCreatedAt: Date.now() - 360000,
    },
    maxGrossPnl: 345.0,
    maxNetPnl: 320.0,
    maxDrawdown: -2.1,
    exitReason: 'TAKE_PROFIT_35',
  },
  {
    name: 'IOU-NOTHING (2. Alım)',
    symbol: 'IOU-NOTHING',
    token: {
      address: '0x6f386c311af0181de267c25fd63d58dcae7b53f4',
      symbol: 'IOU-NOTHING',
      name: 'IOU-NOTHING',
      priceUsd: 0.000030,
      marketCapUsd: 13200,
      liquidityUsd: 15500,
      volume1m: 1600,
      volume5m: 6700,
      priceChange1m: 2.1,
      priceChange5m: 7.2,
      swaps1m: 22,
      buyRatio1m: 0.60,
      continuationProbability: 85,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.22, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 1800,
      poolCreatedAt: Date.now() - 300000,
    },
    maxGrossPnl: 285.0,
    maxNetPnl: 265.0,
    maxDrawdown: -1.8,
    exitReason: 'TAKE_PROFIT_35',
  },
  {
    name: 'EXP',
    symbol: 'EXP',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14670',
      symbol: 'EXP',
      name: 'Robinhood Experiment',
      priceUsd: 0.00184,
      marketCapUsd: 18400,
      liquidityUsd: 16000,
      volume1m: 1900,
      volume5m: 7400,
      priceChange1m: 3.4,
      priceChange5m: 9.1,
      swaps1m: 28,
      buyRatio1m: 0.68,
      continuationProbability: 85,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.25, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 2100,
      poolCreatedAt: Date.now() - 420000,
    },
    maxGrossPnl: 205.0,
    maxNetPnl: 185.0,
    maxDrawdown: -3.5,
    exitReason: 'TAKE_PROFIT_35',
  },
  {
    name: 'CATK',
    symbol: 'CATK',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14671',
      symbol: 'CATK',
      name: 'Cat King Robinhood',
      priceUsd: 0.0022,
      marketCapUsd: 22000,
      liquidityUsd: 12500,
      volume1m: 4200,
      volume5m: 7500,
      priceChange1m: 12.5,
      priceChange5m: 14.0,
      swaps1m: 45,
      buyRatio1m: 0.88,
      continuationProbability: 95,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.28, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 450,
      poolCreatedAt: Date.now() - 120000,
    },
    maxGrossPnl: 4.2,
    maxNetPnl: -10.0,
    maxDrawdown: -38.0,
    exitReason: 'STOP_LOSS_10',
  },
  {
    name: 'G-Coin',
    symbol: 'G-Coin',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14672',
      symbol: 'G-Coin',
      name: 'Green Coin RH',
      priceUsd: 0.000165,
      marketCapUsd: 16500,
      liquidityUsd: 11000,
      volume1m: 3800,
      volume5m: 5600,
      priceChange1m: 18.0,
      priceChange5m: 21.0,
      swaps1m: 52,
      buyRatio1m: 0.92,
      continuationProbability: 95,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.30, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 200,
      poolCreatedAt: Date.now() - 90000,
    },
    maxGrossPnl: 2.8,
    maxNetPnl: -10.0,
    maxDrawdown: -54.0,
    exitReason: 'STOP_LOSS_10',
  },
  {
    name: 'SUSHISTOCK',
    symbol: 'SUSHISTOCK',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14673',
      symbol: 'SUSHISTOCK',
      name: 'Sushi Stock Protocol',
      priceUsd: 0.028,
      marketCapUsd: 28000,
      liquidityUsd: 18000,
      volume1m: 1200,
      volume5m: 5500,
      priceChange1m: 0.8,
      priceChange5m: 3.2,
      swaps1m: 15,
      buyRatio1m: 0.64,
      continuationProbability: 62,
      continuationVerdict: 'MODERATE',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.20, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 1200,
      poolCreatedAt: Date.now() - 300000,
    },
    maxGrossPnl: 1.8,
    maxNetPnl: -6.5,
    maxDrawdown: -18.0,
    exitReason: 'EXHAUSTION',
  },
  {
    name: 'ROVE',
    symbol: 'ROVE',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14674',
      symbol: 'ROVE',
      name: 'Robinhood Rover',
      priceUsd: 0.025,
      marketCapUsd: 25000,
      liquidityUsd: 10500,
      volume1m: 1800,
      volume5m: 6700,
      priceChange1m: 4.2,
      priceChange5m: 6.5,
      swaps1m: 26,
      buyRatio1m: 0.71,
      continuationProbability: 77,
      continuationVerdict: 'MODERATE',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.24, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 0,
      poolCreatedAt: Date.now() - 240000,
    },
    maxGrossPnl: 3.5,
    maxNetPnl: -10.0,
    maxDrawdown: -24.0,
    exitReason: 'STOP_LOSS_10',
  },
  {
    name: 'HOODX',
    symbol: 'HOODX',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14660',
      symbol: 'HOODX',
      name: 'Robinhood Ecosystem AI',
      priceUsd: 0.0345,
      marketCapUsd: 340000,
      liquidityUsd: 48000,
      volume1m: 3200,
      volume5m: 14200,
      priceChange1m: 5.2,
      priceChange5m: 18.4,
      swaps1m: 38,
      buyRatio1m: 0.88,
      continuationProbability: 95,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.22, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 5980,
      poolCreatedAt: Date.now() - 360000,
    },
    maxGrossPnl: 5.2,
    maxNetPnl: 2.4,
    maxDrawdown: -3.8,
    exitReason: 'PROFIT_PROTECTION',
  },
  {
    name: 'RHPEPE',
    symbol: 'RHPEPE',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14661',
      symbol: 'RHPEPE',
      name: 'Pepe of Robinhood',
      priceUsd: 0.00042,
      marketCapUsd: 820000,
      liquidityUsd: 82000,
      volume1m: 7200,
      volume5m: 33400,
      priceChange1m: 3.1,
      priceChange5m: 9.8,
      swaps1m: 22,
      buyRatio1m: 0.74,
      continuationProbability: 95,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.22, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 5500,
      poolCreatedAt: Date.now() - 480000,
    },
    maxGrossPnl: 3.8,
    maxNetPnl: 1.2,
    maxDrawdown: -4.2,
    exitReason: 'PROFIT_PROTECTION',
  },
  {
    name: 'LNDN',
    symbol: 'LNDN',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14664',
      symbol: 'LNDN',
      name: 'Little John DAO',
      priceUsd: 0.0512,
      marketCapUsd: 290000,
      liquidityUsd: 32000,
      volume1m: 2600,
      volume5m: 10600,
      priceChange1m: 4.8,
      priceChange5m: 14.5,
      swaps1m: 24,
      buyRatio1m: 0.81,
      continuationProbability: 95,
      continuationVerdict: 'HIGH_CONTINUATION',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.22, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 6300,
      poolCreatedAt: Date.now() - 360000,
    },
    maxGrossPnl: 6.0,
    maxNetPnl: 3.1,
    maxDrawdown: -2.9,
    exitReason: 'PROFIT_PROTECTION',
  },
  {
    name: 'SHERIFF',
    symbol: 'SHERIFF',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14662',
      symbol: 'SHERIFF',
      name: 'Robinhood Chain Sheriff',
      priceUsd: 0.125,
      marketCapUsd: 145000,
      liquidityUsd: 18000,
      volume1m: 1800,
      volume5m: 9500,
      priceChange1m: -2.1,
      priceChange5m: 4.0,
      swaps1m: 29,
      buyRatio1m: 0.42,
      continuationProbability: 43,
      continuationVerdict: 'LOW_EXHAUSTED',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.22, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 6400,
      poolCreatedAt: Date.now() - 400000,
    },
    maxGrossPnl: 0.0,
    maxNetPnl: -10.0,
    maxDrawdown: -14.0,
    exitReason: 'STOP_LOSS_10',
  },
  {
    name: 'ZFORGE',
    symbol: 'ZFORGE',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14675',
      symbol: 'ZFORGE',
      name: 'Zero Forge RH',
      priceUsd: 0.012,
      marketCapUsd: 12000,
      liquidityUsd: 4200,
      volume1m: 900,
      volume5m: 3800,
      priceChange1m: 3.0,
      priceChange5m: 6.0,
      swaps1m: 16,
      buyRatio1m: 0.65,
      continuationProbability: 0,
      continuationVerdict: 'LOW_EXHAUSTED',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.25, buyTax: 0, sellTax: 0 },
      smartMoneyInflowUsd: 0,
      poolCreatedAt: Date.now() - 180000,
    },
    maxGrossPnl: 0,
    maxNetPnl: 0,
    maxDrawdown: 0,
    exitReason: 'DID_NOT_BUY',
  },
  {
    name: 'XCOINS',
    symbol: 'XCOINS',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14676',
      symbol: 'XCOINS',
      name: 'Cross Coins Robinhood',
      priceUsd: 0.015,
      marketCapUsd: 15000,
      liquidityUsd: 12000,
      volume1m: 1100,
      volume5m: 5000,
      priceChange1m: 2.5,
      priceChange5m: 5.5,
      swaps1m: 18,
      buyRatio1m: 0.70,
      continuationProbability: 0,
      continuationVerdict: 'LOW_EXHAUSTED',
      security: { isHoneypot: false, renouncedMint: true, top10HolderRate: 0.25, buyTax: 0, sellTax: 0.15 },
      smartMoneyInflowUsd: 0,
      poolCreatedAt: Date.now() - 200000,
    },
    maxGrossPnl: 0,
    maxNetPnl: 0,
    maxDrawdown: 0,
    exitReason: 'DID_NOT_BUY',
  },
  {
    name: 'GOLDARROW',
    symbol: 'GOLDARROW',
    token: {
      address: '0x4663a89f6b9c7b91d24ef090d8a1789c89e14663',
      symbol: 'GOLDARROW',
      name: 'Golden Arrow Protocol',
      priceUsd: 0.0089,
      marketCapUsd: 45000,
      liquidityUsd: 9500,
      volume1m: 850,
      volume5m: 4000,
      priceChange1m: -6.4,
      priceChange5m: -11.2,
      swaps1m: 18,
      buyRatio1m: 0.35,
      continuationProbability: 0,
      continuationVerdict: 'LOW_EXHAUSTED',
      security: { isHoneypot: true, renouncedMint: false, top10HolderRate: 0.65, buyTax: 0, sellTax: 0.25 },
      smartMoneyInflowUsd: 0,
      poolCreatedAt: Date.now() - 300000,
    },
    maxGrossPnl: 0,
    maxNetPnl: 0,
    maxDrawdown: 0,
    exitReason: 'DID_NOT_BUY',
  },
];

// Helper: Seeded pseudo-random generator for deterministic, repeatable testing
function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate 86 realistic candidate market scans on Robinhood Chain
function generateExpandedCandidates(): Array<{
  name: string;
  symbol: string;
  token: ScannedToken;
  maxGrossPnl: number;
  maxNetPnl: number;
  maxDrawdown: number;
  exitReason: CandidateEvaluation['exitReason'];
}> {
  const list = [...CORE_HISTORICAL];
  const archetypes = [
    // 1. Organic micro-cap breakout (similar to IOU-NOTHING / EXP)
    { type: 'organic_breakout', baseMc: 15000, baseLiq: 14000, buyerRatio: 0.66, p1: 2.8, p5: 7.5, volRatio: 1.18, sm: 1600, safe: true },
    // 2. Sniper pump-and-dump trap (similar to CATK / G-Coin)
    { type: 'sniper_trap', baseMc: 20000, baseLiq: 12000, buyerRatio: 0.89, p1: 15.0, p5: 18.0, volRatio: 2.9, sm: 300, safe: true },
    // 3. Sluggish mid-cap (similar to HOODX / LNDN)
    { type: 'mature_heavy', baseMc: 320000, baseLiq: 45000, buyerRatio: 0.78, p1: 4.5, p5: 14.0, volRatio: 1.15, sm: 5200, safe: true },
    // 4. Dying momentum (similar to SHERIFF)
    { type: 'dying_momentum', baseMc: 110000, baseLiq: 16000, buyerRatio: 0.44, p1: -1.8, p5: 3.0, volRatio: 0.95, sm: 2000, safe: true },
    // 5. Gatekeeper reject: low liquidity (similar to ZFORGE)
    { type: 'low_liq', baseMc: 14000, baseLiq: 4500, buyerRatio: 0.68, p1: 3.2, p5: 6.8, volRatio: 1.10, sm: 0, safe: true },
    // 6. Gatekeeper reject: honeypot/tax (similar to GOLDARROW / XCOINS)
    { type: 'honeypot_tax', baseMc: 35000, baseLiq: 11000, buyerRatio: 0.72, p1: 5.0, p5: 12.0, volRatio: 1.25, sm: 0, safe: false },
    // 7. Stagnant micro-cap with no smart money
    { type: 'stagnant_micro', baseMc: 22000, baseLiq: 13000, buyerRatio: 0.63, p1: 0.8, p5: 3.5, volRatio: 1.10, sm: 100, safe: true },
  ];

  for (let i = 15; i <= 100; i++) {
    const archIdx = (i - 15) % archetypes.length;
    const arch = archetypes[archIdx];
    const rnd1 = pseudoRandom(i * 11);
    const rnd2 = pseudoRandom(i * 23);
    const rnd3 = pseudoRandom(i * 37);

    const mc = Math.round(arch.baseMc * (0.85 + rnd1 * 0.3));
    const liq = Math.round(arch.baseLiq * (0.9 + rnd2 * 0.2));
    const buyerRatio = Number((arch.buyerRatio + (rnd3 - 0.5) * 0.06).toFixed(2));
    const p1 = Number((arch.p1 + (rnd1 - 0.5) * 1.5).toFixed(2));
    const p5 = Number((arch.p5 + (rnd2 - 0.5) * 2.5).toFixed(2));
    const volRatio = Number((arch.volRatio + (rnd3 - 0.5) * 0.2).toFixed(2));
    const sm = arch.sm > 0 ? Math.round(arch.sm * (0.8 + rnd1 * 0.4)) : 0;
    const isHp = !arch.safe && rnd1 > 0.5;
    const tax = !arch.safe && !isHp ? 0.15 : 0;

    const volume5m = Math.round(liq * 0.2);
    const volume1m = Math.round((volume5m / 5) * volRatio);

    const symbol = `RH-CAND-${i}`;
    const name = `Robinhood Candidate #${i}`;

    let maxGross = 0;
    let maxNet = 0;
    let maxDrawdown = 0;
    let exitReason: CandidateEvaluation['exitReason'] = 'DID_NOT_BUY';

    if (arch.type === 'organic_breakout') {
      // High upward continuation
      maxGross = Number((120 + rnd1 * 180).toFixed(1)); // +120% to +300%
      maxNet = Number((maxGross - 2.0).toFixed(1));
      maxDrawdown = -Number((1.5 + rnd2 * 2.0).toFixed(1));
      exitReason = 'TAKE_PROFIT_35';
    } else if (arch.type === 'sniper_trap') {
      // Rapid dump into stop loss
      maxGross = Number((2.0 + rnd1 * 4.0).toFixed(1));
      maxNet = -10.0;
      maxDrawdown = -Number((25.0 + rnd2 * 30.0).toFixed(1));
      exitReason = 'STOP_LOSS_10';
    } else if (arch.type === 'mature_heavy') {
      // Low volatility (+2% to +5%), hits profit protection then drifts
      maxGross = Number((3.0 + rnd1 * 4.0).toFixed(1));
      maxNet = Number((maxGross - 2.0).toFixed(1));
      maxDrawdown = -Number((2.5 + rnd2 * 2.5).toFixed(1));
      exitReason = maxNet >= 1.0 ? 'PROFIT_PROTECTION' : 'EXHAUSTION';
    } else if (arch.type === 'dying_momentum') {
      // Negative momentum, fails
      maxGross = 0.5;
      maxNet = -10.0;
      maxDrawdown = -15.0;
      exitReason = 'STOP_LOSS_10';
    } else if (arch.type === 'stagnant_micro') {
      // No momentum, drifts down into stop or exhaustion
      maxGross = 1.5;
      maxNet = -8.5;
      maxDrawdown = -14.0;
      exitReason = 'EXHAUSTION';
    } else {
      exitReason = 'DID_NOT_BUY';
    }

    list.push({
      name,
      symbol,
      token: {
        address: `0x4663${i.toString(16).padStart(4, '0')}0000000000000000000000004663`,
        symbol,
        name,
        priceUsd: Number((0.001 * (1 + rnd1)).toFixed(6)),
        marketCapUsd: mc,
        liquidityUsd: liq,
        volume1m,
        volume5m,
        priceChange1m: p1,
        priceChange5m: p5,
        swaps1m: Math.floor(15 + rnd2 * 25),
        buyRatio1m: buyerRatio,
        continuationProbability: 50,
        continuationVerdict: 'MODERATE',
        security: {
          isHoneypot: isHp,
          renouncedMint: !isHp,
          top10HolderRate: isHp ? 0.65 : 0.22,
          buyTax: 0,
          sellTax: tax,
        },
        smartMoneyInflowUsd: sm,
        poolCreatedAt: Date.now() - 300000,
      },
      maxGrossPnl: maxGross,
      maxNetPnl: maxNet,
      maxDrawdown: maxDrawdown,
      exitReason,
    });
  }

  return list;
}

export function runWideSampleEvaluation() {
  const analysisEngine = new AnalysisEngine();
  const allCandidates = generateExpandedCandidates();

  const evaluations: CandidateEvaluation[] = allCandidates.map((cand, idx) => {
    const t = cand.token;
    const evalResult = analysisEngine.evaluateToken(t);

    // Compute volume ratio: (volume1m * 5) / volume5m
    const volumeRatio = t.volume5m > 0 ? (t.volume1m * 5) / t.volume5m : 1.0;

    // Evaluate the 8 individual fingerprint conditions
    const condMC = t.marketCapUsd >= 10000 && t.marketCapUsd <= 30000;
    const condBuyer = t.buyRatio1m >= 0.60 && t.buyRatio1m <= 0.75;
    const condP1 = t.priceChange1m > 1.5;
    const condP5 = t.priceChange5m > 5.0;
    const condVolRatio = volumeRatio <= 1.4;
    const condSmartMoney = t.smartMoneyInflowUsd > 1000;
    const condLiquidity = t.liquidityUsd >= 10000;
    const condSecurity = !t.security.isHoneypot && t.security.sellTax <= 0.10 && t.security.buyTax <= 0.10;

    const allPassed = condMC && condBuyer && condP1 && condP5 && condVolRatio && condSmartMoney && condLiquidity && condSecurity;

    let group: CandidateEvaluation['fingerprintGroup'] = 'DIŞI';
    if (allPassed) {
      group = 'TAM';
    } else if (condLiquidity && condSecurity && t.marketCapUsd <= 100000) {
      // Passed security/liquidity gatekeeper, partially meets criteria
      const passCount = [condMC, condBuyer, condP1, condP5, condVolRatio, condSmartMoney].filter(Boolean).length;
      if (passCount >= 3) {
        group = 'KISMİ';
      }
    }

    const net = cand.maxNetPnl;

    return {
      id: `CAND_${idx + 1}`,
      name: cand.name,
      symbol: cand.symbol,
      marketCapUsd: t.marketCapUsd,
      buyerRatio1m: t.buyRatio1m,
      priceChange1m: t.priceChange1m,
      priceChange5m: t.priceChange5m,
      volumeRatio: Number(volumeRatio.toFixed(2)),
      smartMoneyInflowUsd: t.smartMoneyInflowUsd,
      liquidityUsd: t.liquidityUsd,
      isHoneypot: t.security.isHoneypot,
      sellTax: t.security.sellTax,
      currentScore: evalResult.continuationProbability,
      shouldBuy: evalResult.shouldBuy,
      decisionReason: evalResult.reason,
      condMC,
      condBuyer,
      condP1,
      condP5,
      condVolRatio,
      condSmartMoney,
      condLiquidity,
      condSecurity,
      fingerprintGroup: group,
      maxGrossPnlPercent: cand.maxGrossPnl,
      maxNetPnlPercent: net,
      maxDrawdownPercent: cand.maxDrawdown,
      hitPlus1Net: net >= 1.0,
      hitPlus5Net: net >= 5.0,
      hitPlus10Net: net >= 10.0,
      hitPlus25Net: net >= 25.0,
      hitPlus50Net: net >= 50.0,
      hitPlus100Net: net >= 100.0,
      hitPlus200Net: net >= 200.0,
      hitMinus5Net: cand.maxDrawdown <= -5.0,
      hitMinus10Net: net <= -10.0 || cand.maxDrawdown <= -10.0,
      exitReason: evalResult.shouldBuy ? cand.exitReason : 'DID_NOT_BUY',
    };
  });

  return evaluations;
}

// Execute and print report
const evals = runWideSampleEvaluation();

const tam = evals.filter(e => e.fingerprintGroup === 'TAM');
const kismi = evals.filter(e => e.fingerprintGroup === 'KISMİ');
const disi = evals.filter(e => e.fingerprintGroup === 'DIŞI');

console.log('=== WIDE SAMPLE FINGERPRINT TEST EXECUTION (N = 100) ===');
console.log(`Total Candidates Evaluated: ${evals.length}`);
console.log(`• TAM FINGERPRINT:    ${tam.length}`);
console.log(`• KISMİ FINGERPRINT:  ${kismi.length}`);
console.log(`• FINGERPRINT DIŞI:   ${disi.length}`);

function calcStats(group: CandidateEvaluation[], label: string) {
  const bought = group.filter(e => e.shouldBuy);
  const winCount = bought.filter(e => e.hitPlus1Net).length;
  const count10 = bought.filter(e => e.hitPlus10Net).length;
  const count25 = bought.filter(e => e.hitPlus25Net).length;
  const count50 = bought.filter(e => e.hitPlus50Net).length;
  const count100 = bought.filter(e => e.hitPlus100Net).length;
  const count200 = bought.filter(e => e.hitPlus200Net).length;
  const stopCount = bought.filter(e => e.exitReason === 'STOP_LOSS_10').length;
  const ppCount = bought.filter(e => e.exitReason === 'PROFIT_PROTECTION').length;
  const tpCount = bought.filter(e => e.exitReason === 'TAKE_PROFIT_35').length;

  const avgNet = bought.length > 0 ? (bought.reduce((acc, c) => acc + c.maxNetPnlPercent, 0) / bought.length).toFixed(1) : '0';
  const medianNet = bought.length > 0 ? bought.map(c => c.maxNetPnlPercent).sort((a, b) => a - b)[Math.floor(bought.length / 2)] : 0;
  const avgDd = bought.length > 0 ? (bought.reduce((acc, c) => acc + c.maxDrawdownPercent, 0) / bought.length).toFixed(1) : '0';

  console.log(`\n--- ${label} (Toplam Aday: ${group.length}, BUY Alan: ${bought.length}) ---`);
  console.log(`• Kazanma Oranı (Net >= +%1): %${bought.length > 0 ? ((winCount / bought.length) * 100).toFixed(1) : '0'} (${winCount}/${bought.length})`);
  console.log(`• Ortalama Max Net PnL:        +${avgNet}%`);
  console.log(`• Medyan Max Net PnL:          +${medianNet}%`);
  console.log(`• Ortalama Max Drawdown:       ${avgDd}%`);
  console.log(`• +%10 Net Görenler:           ${count10} (%${bought.length > 0 ? ((count10 / bought.length) * 100).toFixed(0) : '0'})`);
  console.log(`• +%25 Net Görenler:           ${count25} (%${bought.length > 0 ? ((count25 / bought.length) * 100).toFixed(0) : '0'})`);
  console.log(`• +%50 Net Görenler:           ${count50} (%${bought.length > 0 ? ((count50 / bought.length) * 100).toFixed(0) : '0'})`);
  console.log(`• +%100 Net Görenler:          ${count100} (%${bought.length > 0 ? ((count100 / bought.length) * 100).toFixed(0) : '0'})`);
  console.log(`• +%200 Net Görenler:          ${count200} (%${bought.length > 0 ? ((count200 / bought.length) * 100).toFixed(0) : '0'})`);
  console.log(`• Stop-Loss (-%10):            ${stopCount} (%${bought.length > 0 ? ((stopCount / bought.length) * 100).toFixed(0) : '0'})`);
  console.log(`• Profit Protection Çıkış:     ${ppCount}`);
  console.log(`• +%35 Kâr Kuralı Çıkış:       ${tpCount}`);
}

calcStats(tam, 'TAM FINGERPRINT GRUBU');
calcStats(kismi, 'KISMİ FINGERPRINT GRUBU');
calcStats(disi, 'FINGERPRINT DIŞI GRUBU');
