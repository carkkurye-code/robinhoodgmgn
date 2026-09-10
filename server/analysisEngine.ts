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
    tokenStage: 'NEW_ENTRY' | 'SATURATED_HIGH_CAP' | 'RISKY';
    isNewOpportunity: boolean;
    iouMatch: 'TAM' | 'KISMİ' | 'DIŞI';
    iouMatchDetails: string;
  } {
    // 1. Critical Security Filters (Gatekeepers)
    if (token.security.isHoneypot) {
      return {
        score: 0,
        verdict: 'LOW_EXHAUSTED',
        reason: 'Honeypot tespit edildi. İşlem iptal.',
        shouldBuy: false,
        tokenStage: 'RISKY',
        isNewOpportunity: false,
        iouMatch: 'DIŞI',
        iouMatchDetails: 'Honeypot güvenlik engeli',
      };
    }
    if (!token.security.renouncedMint && token.security.top10HolderRate > 0.40) {
      return {
        score: 15,
        verdict: 'LOW_EXHAUSTED',
        reason: 'Mint yetkisi açık ve ilk 10 cüzdan %40 üzeri yoğunlaşmış.',
        shouldBuy: false,
        tokenStage: 'RISKY',
        isNewOpportunity: false,
        iouMatch: 'DIŞI',
        iouMatchDetails: 'Mint yetkisi ve cüzdan yoğunluğu riski',
      };
    }
    if (token.security.sellTax > 0.10) {
      return {
        score: 10,
        verdict: 'LOW_EXHAUSTED',
        reason: `Yüksek satış vergisi (%${token.security.sellTax * 100}).`,
        shouldBuy: false,
        tokenStage: 'RISKY',
        isNewOpportunity: false,
        iouMatch: 'DIŞI',
        iouMatchDetails: 'Yüksek satış vergisi (> %10)',
      };
    }
    if (token.liquidityUsd < 10000) {
      return {
        score: 20,
        verdict: 'LOW_EXHAUSTED',
        reason: 'Yetersiz likidite ($10,000 altı).',
        shouldBuy: false,
        tokenStage: 'RISKY',
        isNewOpportunity: false,
        iouMatch: 'DIŞI',
        iouMatchDetails: 'Likidite tabanı yetersiz (< $10,000)',
      };
    }

    // 2. Market Stage Identification (Yeni Giren vs. Zaten Yükselmiş / Doygun)
    const isRecentPool = token.poolCreatedAt ? (Date.now() - token.poolCreatedAt) < 1800000 : true;
    const tokenStage: 'NEW_ENTRY' | 'SATURATED_HIGH_CAP' | 'RISKY' = token.tokenStage
      ? token.tokenStage
      : (!isRecentPool ? 'SATURATED_HIGH_CAP' : 'NEW_ENTRY');
    const isNewOpportunity = tokenStage === 'NEW_ENTRY';

    // 3. Mevcut Dinamik Puanlama Sistemi (Orijinal haliyle korundu)
    let score = 50; // base neutral score

    // Buyer Pressure & Volume Acceleration
    if (token.buyRatio1m >= 0.75) {
      score += 22;
    } else if (token.buyRatio1m >= 0.60) {
      score += 12;
    } else if (token.buyRatio1m < 0.45) {
      score -= 25; // Seller dominance
    }

    // Price Velocity (1m vs 5m)
    if (token.priceChange1m > 1.5 && token.priceChange5m > 5) {
      score += 15; // Clean uptrend momentum
    } else if (token.priceChange1m < -3) {
      score -= 20; // Sudden breakdown
    }

    // Volume Surge
    const volumeRatio = token.volume5m > 0 ? (token.volume1m * 5) / token.volume5m : 1;
    if (volumeRatio > 1.4) {
      score += 10; // Hacim ivmesi artıyor
    }

    // Smart Money
    if (token.smartMoneyInflowUsd > 1000) {
      score += 8;
    }

    // Cap between 0 and 99
    score = Math.max(0, Math.min(99, Math.round(score)));

    let verdict: 'HIGH_CONTINUATION' | 'MODERATE' | 'LOW_EXHAUSTED' = 'MODERATE';
    if (score >= 78) {
      verdict = 'HIGH_CONTINUATION';
    } else if (score >= 50) {
      verdict = 'MODERATE';
    } else {
      verdict = 'LOW_EXHAUSTED';
    }

    // 4. Kural: Piyasada Zaten Yükselmiş, Olgunlaşmış Tokenler (HOODX, RHPEPE, LNDN vb.)
    // Skor %95 - %99 dahi olsa, yeni giren bir fırsat olmadığı için KESİNLİKLE ALIM YAPILMAZ!
    if (tokenStage === 'SATURATED_HIGH_CAP') {
      return {
        score,
        verdict,
        reason: `Skor %${score} yüksek olsa da token piyasada zaten yükselmiş ve olgunlaşmış aşamadadır (HOODX/RHPEPE/LNDN tipi). Bot yalnızca yeni giren erken fırsatlara odaklandığı için alım yapılmadı.`,
        shouldBuy: false,
        tokenStage: 'SATURATED_HIGH_CAP',
        isNewOpportunity: false,
        iouMatch: 'DIŞI',
        iouMatchDetails: 'Piyasada zaten yükselmiş / olgunlaşmış aşama (Alım yasak)',
      };
    }

    // 5. Yeni Giren Tokenlerde IOU Erken Dönem Davranış Uyumu Değerlendirmesi
    // Sabit rakamlar yerine IOU'nun BUY anındaki sağlıklı davranış yapısı değerlendirilir:
    // - Alıcılar satıcılara üstün (organik alıcı baskısı var, satıcı dökülmesi yok)
    // - Erken dönem fiyat keşfinde 1m ve 5m momentumu pozitif ve uyumlu (ani breakdown yok)
    // - Sağlıklı swap akışı (işlem görüyor, hemen körlemesine alınmıyor)
    // - Dinamik devamlılık skoru eşiği (score >= 78)
    const hasBuyerControl = token.buyRatio1m > 0.50;
    const hasPositiveMomentum = token.priceChange1m > 0 && token.priceChange5m > 0;
    const hasActiveDiscovery = token.swaps1m >= 3;
    const hasHealthyBehavior = hasBuyerControl && hasPositiveMomentum && hasActiveDiscovery;

    let iouMatch: 'TAM' | 'KISMİ' | 'DIŞI' = 'KISMİ';
    let iouMatchDetails = '';
    let shouldBuy = false;
    let reason = '';

    if (hasHealthyBehavior && score >= 78) {
      iouMatch = 'TAM';
      iouMatchDetails = 'IOU-NOTHING benzeri sağlıklı erken dönem davranışı: organik alıcı hakimiyeti, pozitif momentum uyumu ve yüksek devamlılık teyidi.';
      shouldBuy = true;
      reason = `Yeni giren fırsat + IOU benzeri sağlıklı erken dönem davranışı (Alıcı baskısı %${Math.round(token.buyRatio1m * 100)}, pozitif ivme teyidi, Dinamik Skor %${score}). BUY onaylandı.`;
    } else if (hasHealthyBehavior && score < 78) {
      iouMatch = 'KISMİ';
      iouMatchDetails = 'Erken dönem yapısı olumlu ancak Dinamik Skor henüz alım eşiğinin altında.';
      shouldBuy = false;
      reason = `Yeni giren token; erken dönem davranışı olumlu ancak Dinamik Skor (%${score}) henüz alım eşiğinin altında (%78). Gözlemleniyor.`;
    } else if (!hasBuyerControl) {
      iouMatch = 'KISMİ';
      iouMatchDetails = 'Satıcı baskısı hakim veya alıcılar henüz kontrolü ele almadı.';
      shouldBuy = false;
      reason = `Yeni giren token; erken dönemde satıcı baskısı yüksek (Alım oranı %${Math.round(token.buyRatio1m * 100)}). IOU tipi alıcı kontrolü henüz yok; pas geçildi.`;
    } else if (!hasPositiveMomentum) {
      iouMatch = 'KISMİ';
      iouMatchDetails = 'Fiyat ivmesi henüz yukarı yönlü teyit vermedi.';
      shouldBuy = false;
      reason = `Yeni giren token; erken dönemde fiyat ivmesi negatif veya zayıf (1m: %${token.priceChange1m.toFixed(1)}, 5m: %${token.priceChange5m.toFixed(1)}). Gözlemleniyor.`;
    } else {
      iouMatch = 'KISMİ';
      iouMatchDetails = 'Erken dönem gözlem ve teyit aşamasında.';
      shouldBuy = false;
      reason = `Yeni giren token; erken dönem davranışı gözlemleniyor, teyit bekleniyor.`;
    }

    return {
      score,
      verdict,
      reason,
      shouldBuy,
      tokenStage,
      isNewOpportunity,
      iouMatch,
      iouMatchDetails,
    };
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
