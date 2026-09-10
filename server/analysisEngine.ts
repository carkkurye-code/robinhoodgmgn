import type { ScannedToken, ActivePosition } from './types.js';

export class AnalysisEngine {
  /**
   * Calculates dynamic continuation probability (0 - 100)
   * High score means bullish pressure is continuing, NOT exhausted.
   */
  public evaluateToken(token: ScannedToken): {
    score: number;
    verdict: 'HIGH_CONTINUATION' | 'MODERATE' | 'LOW_EXHAUSTED';
    reason: string;
    shouldBuy: boolean;
  } {
    // 1. Critical Security Filters
    if (token.security.isHoneypot) {
      return {
        score: 0,
        verdict: 'LOW_EXHAUSTED',
        reason: 'Honeypot tespit edildi. İşlem iptal.',
        shouldBuy: false,
      };
    }
    if (!token.security.renouncedMint && token.security.top10HolderRate > 0.40) {
      return {
        score: 15,
        verdict: 'LOW_EXHAUSTED',
        reason: 'Mint yetkisi açık ve ilk 10 cüzdan %40 üzeri yoğunlaşmış.',
        shouldBuy: false,
      };
    }
    if (token.security.sellTax > 0.10) {
      return {
        score: 10,
        verdict: 'LOW_EXHAUSTED',
        reason: `Yüksek satış vergisi (%${token.security.sellTax * 100}).`,
        shouldBuy: false,
      };
    }
    if (token.liquidityUsd < 10000) {
      return {
        score: 20,
        verdict: 'LOW_EXHAUSTED',
        reason: 'Yetersiz likidite ($10,000 altı).',
        shouldBuy: false,
      };
    }

    let score = 50; // base neutral score

    // 2. Buyer Pressure & Volume Acceleration
    // Buy ratio >= 70% adds strong points
    if (token.buyRatio1m >= 0.75) {
      score += 22;
    } else if (token.buyRatio1m >= 0.60) {
      score += 12;
    } else if (token.buyRatio1m < 0.45) {
      score -= 25; // Seller dominance
    }

    // 3. Price Velocity (1m vs 5m)
    if (token.priceChange1m > 1.5 && token.priceChange5m > 5) {
      score += 15; // Clean uptrend momentum
    } else if (token.priceChange1m < -3) {
      score -= 20; // Sudden breakdown
    }

    // 4. Volume Surge
    const volumeRatio = token.volume5m > 0 ? (token.volume1m * 5) / token.volume5m : 1;
    if (volumeRatio > 1.4) {
      score += 10; // Hacim ivmesi artıyor
    }

    // 5. Smart Money
    if (token.smartMoneyInflowUsd > 1000) {
      score += 8;
    }

    // Cap between 0 and 99
    score = Math.max(0, Math.min(99, Math.round(score)));

    let verdict: 'HIGH_CONTINUATION' | 'MODERATE' | 'LOW_EXHAUSTED' = 'MODERATE';
    let shouldBuy = false;
    let reason = '';

    if (score >= 78) {
      verdict = 'HIGH_CONTINUATION';
      shouldBuy = true;
      reason = `Güçlü alıcı baskısı (%${Math.round(token.buyRatio1m * 100)} alım), hacim ivmesi ve temiz güvenlik skoru.`;
    } else if (score >= 50) {
      verdict = 'MODERATE';
      reason = 'Momentum dengeli ancak giriş için yeterli kırılım onayı yok.';
    } else {
      verdict = 'LOW_EXHAUSTED';
      reason = 'Yükseliş ivmesi tükenmiş veya satıcı baskısı yüksek.';
    }

    return { score, verdict, reason, shouldBuy };
  }

  /**
   * Dynamic exit determination:
   * Instead of fixed TP (e.g. +10%) or SL (e.g. -5%),
   * monitors active order momentum, orderflow exhaustion, or trend decay.
   */
  public evaluateExit(position: ActivePosition, currentMarketToken?: ScannedToken): {
    shouldExit: boolean;
    reason: string;
    newMomentumStatus: 'strong' | 'weakening' | 'exhausted';
  } {
    const pnl = position.unrealizedPnlPercent;
    // Prioritize net PnL if calculated on position, otherwise gross PnL
    const effectiveNetPnl = typeof position.unrealizedNetPnlPercent === 'number'
      ? position.unrealizedNetPnlPercent
      : pnl;

    // Case 0.5: Strict -%10.00 Net Stop-Loss
    // Triggers when Net PnL is <= -10.00% (e.g. -9.99% -> NO SELL, -10.00% -> SELL, -12% -> SELL)
    if (effectiveNetPnl <= -10.00) {
      return {
        shouldExit: true,
        reason: `Stop-Loss tetiklendi (Net K/Z: %${effectiveNetPnl.toFixed(2)} <= -%10.00). Kasa koruma amacıyla çıkıldı.`,
        newMomentumStatus: 'exhausted',
      };
    }

    // Case 5: Kâr Koruma (Profit Protection)
    // Bir açık pozisyon Net PnL olarak >= +%1.00 seviyesine çıktığında kâr koruma aktif olur.
    // Kâr koruma aktif olduktan sonra Net PnL tekrar <= %0.00 olduğunda SELL edilir.
    if (position.profitProtectionActive && effectiveNetPnl <= 0.00) {
      return {
        shouldExit: true,
        reason: `Kâr koruma tetiklendi (Zirve Net: +%${(position.maxNetPnlPercentReached ?? 1).toFixed(2)}, mevcut Net: %${effectiveNetPnl.toFixed(2)} <= %0.00). Başa baş/kâr koruma ile çıkıldı.`,
        newMomentumStatus: 'exhausted',
      };
    }

    if (!currentMarketToken) {
      return {
        shouldExit: false,
        reason: 'Veri bekleniyor',
        newMomentumStatus: position.momentumStatus,
      };
    }

    // Case 1: Buyer exhaustion after good run
    if (currentMarketToken.buyRatio1m < 0.40 && currentMarketToken.priceChange1m < -1.5) {
      return {
        shouldExit: true,
        reason: `Alıcı ivmesi tükendi (Alım oranı %${Math.round(currentMarketToken.buyRatio1m * 100)}'e düştü). Dinamik kâr/zarar korumasıyla çıkıldı.`,
        newMomentumStatus: 'exhausted',
      };
    }

    // Case 2: Deep trend breakdown or honeypot mutation
    if (currentMarketToken.security.isHoneypot || currentMarketToken.security.sellTax > 0.15) {
      return {
        shouldExit: true,
        reason: 'Güvenlik anomalisi tespit edildi (Honeypot/Vergi artışı). Acil dinamik çıkış.',
        newMomentumStatus: 'exhausted',
      };
    }

    // Case 4: High gain trailing momentum
    if (pnl >= 35 && currentMarketToken.priceChange1m < -2.0) {
      return {
        shouldExit: true,
        reason: `Yüksek kâr bölgesi (%${pnl.toFixed(1)}) sonrası 1 dakikalık düzeltme sinyali. Dinamik kâr realize edildi.`,
        newMomentumStatus: 'exhausted',
      };
    }

    // Case 3: Prolonged weakening momentum
    if (currentMarketToken.buyRatio1m < 0.50) {
      return {
        shouldExit: false,
        reason: 'Alıcı baskısı hafif zayıflıyor; dinamik takip sürüyor.',
        newMomentumStatus: 'weakening',
      };
    }

    return {
      shouldExit: false,
      reason: `Alıcı ivmesi devam ediyor (%${Math.round(currentMarketToken.buyRatio1m * 100)} alım). Pozisyon korunuyor.`,
      newMomentumStatus: 'strong',
    };
  }
}
