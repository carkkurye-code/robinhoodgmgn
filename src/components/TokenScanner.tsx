import React, { useState } from 'react';
import {
  Radar,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Clock,
  TrendingUp,
  Info,
  ChevronRight,
  Droplets,
  DollarSign,
  Sparkles,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import type { ScannedToken } from '../types';

interface TokenScannerProps {
  tokens: ScannedToken[];
  lastScanTime: number;
  radarStatus?: {
    success: boolean;
    source: string;
    tokenCount: number;
    error: string | null;
    lastFetchTime: number;
    lastSuccessTime?: number;
  };
}

export const TokenScanner: React.FC<TokenScannerProps> = ({ tokens, lastScanTime, radarStatus }) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'NEW' | 'IOU_TAM' | 'SATURATED'>('ALL');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).catch(() => {
        fallbackCopyTextToClipboard(address);
      });
    } else {
      fallbackCopyTextToClipboard(address);
    }
    setCopiedAddress(address);
    setTimeout(() => {
      setCopiedAddress((prev) => (prev === address ? null : prev));
    }, 2000);
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  };

  const newCount = tokens.filter((t) => t.tokenStage === 'NEW_ENTRY').length;
  const iouTamCount = tokens.filter((t) => t.iouMatch === 'TAM').length;
  const saturatedCount = tokens.filter((t) => t.tokenStage === 'SATURATED_HIGH_CAP').length;

  const filteredTokens = tokens.filter((t) => {
    if (activeFilter === 'NEW') return t.tokenStage === 'NEW_ENTRY';
    if (activeFilter === 'IOU_TAM') return t.iouMatch === 'TAM';
    if (activeFilter === 'SATURATED') return t.tokenStage === 'SATURATED_HIGH_CAP';
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Radar className="h-5 w-5 text-emerald-400 animate-pulse" />
            <h2 className="text-base font-semibold text-white">
              Robinhood Chain (4663) GMGN Havuz & Token Radarı
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Canlı GMGN Verisi
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Robinhood Chain üzerindeki gerçek havuzları tarar, IOU profiline uyan erken fırsatları belirler; doygun tokenleri eler.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <span className="flex items-center space-x-1">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span>Son Tarama: {lastScanTime ? new Date(lastScanTime).toLocaleTimeString('tr-TR') : 'Bekleniyor...'}</span>
          </span>
          <span className="font-mono text-emerald-400">Taranan: {tokens.length}</span>
        </div>
      </div>

      {radarStatus?.error && (
        <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-start space-x-2 text-xs text-rose-300">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Gerçek Radar Durumu: </span>
            <span>{radarStatus.error} (Statik test tokenlerine geçilmez; gerçek piyasa verisi bekleniyor).</span>
          </div>
        </div>
      )}

      {/* Strategic Rule Banner */}
      <div className="mt-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-start space-x-3">
        <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
        <div className="text-xs">
          <span className="font-semibold text-emerald-300">Stratejik Kural: </span>
          <span className="text-slate-300">
            &ldquo;Skoru yüksek olanı al&rdquo; değil, &ldquo;<strong>yeni giren tokenler arasından IOU gibi olabilecek güçlü fırsatı bul ve sadece uygun olanı al.</strong>&rdquo;
            HOODX, RHPEPE ve LNDN gibi tokenler %95–%99 Dinamik Skor alsa bile piyasada zaten yükselmiş oldukları için satın alınmaz.
          </span>
        </div>
      </div>

      {/* Filter Tabs & Summary Counters */}
      <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
        <button
          type="button"
          onClick={() => setActiveFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg border font-medium transition-all ${
            activeFilter === 'ALL'
              ? 'bg-slate-800 text-white border-slate-600'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          Tümü ({tokens.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('IOU_TAM')}
          className={`px-3 py-1.5 rounded-lg border font-medium flex items-center space-x-1.5 transition-all ${
            activeFilter === 'IOU_TAM'
              ? 'bg-emerald-900/60 text-emerald-200 border-emerald-600'
              : 'bg-slate-950 text-emerald-400 border-emerald-900/60 hover:bg-emerald-950/40'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>IOU Fırsatı ({iouTamCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('NEW')}
          className={`px-3 py-1.5 rounded-lg border font-medium transition-all ${
            activeFilter === 'NEW'
              ? 'bg-sky-900/60 text-sky-200 border-sky-600'
              : 'bg-slate-950 text-sky-400 border-sky-900/60 hover:bg-sky-950/40'
          }`}
        >
          Yeni Girenler ({newCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('SATURATED')}
          className={`px-3 py-1.5 rounded-lg border font-medium transition-all ${
            activeFilter === 'SATURATED'
              ? 'bg-amber-900/60 text-amber-200 border-amber-600'
              : 'bg-slate-950 text-amber-400 border-amber-900/60 hover:bg-amber-950/40'
          }`}
        >
          Doygun / Yüksek MC ({saturatedCount})
        </button>
      </div>

      {/* Token Cards Grid */}
      {filteredTokens.length === 0 ? (
        <div className="mt-4 p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400">
          <Radar className="h-8 w-8 mx-auto mb-2 text-slate-600 animate-pulse" />
          <p className="text-sm font-medium text-slate-300">Robinhood Chain (4663) GMGN Radarı İzleniyor</p>
          <p className="text-xs text-slate-500 mt-1">
            Filtreye uyan veya aktif taranan token bulunmuyor. Statik test tokenleri kullanılmaz; sadece gerçek zincir verisi taranır.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {filteredTokens.map((token) => {
          const isHigh = token.continuationVerdict === 'HIGH_CONTINUATION';
          const isExhausted = token.continuationVerdict === 'LOW_EXHAUSTED';
          const isNewEntry = token.tokenStage === 'NEW_ENTRY';
          const isSaturated = token.tokenStage === 'SATURATED_HIGH_CAP';
          const isIouTam = token.iouMatch === 'TAM';

          const cardBorder = isIouTam
            ? 'bg-slate-950 border-emerald-500/70 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30'
            : isSaturated
            ? 'bg-slate-950 border-amber-900/50'
            : isHigh
            ? 'bg-slate-950 border-slate-700'
            : 'bg-slate-950 border-slate-800/80 hover:border-slate-700';

          return (
            <div
              key={token.address}
              className={`rounded-xl p-4 border transition-all flex flex-col justify-between ${cardBorder}`}
            >
              <div>
                {/* Top Badge: Stage & IOU Match */}
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  {isNewEntry ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-sky-950/90 text-sky-400 border border-sky-800">
                      Yeni Giren Fırsat
                    </span>
                  ) : isSaturated ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-950/90 text-amber-400 border border-amber-800 flex items-center space-x-1">
                      <Ban className="h-3 w-3" />
                      <span>Zaten Yükselmiş / Doygun</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-rose-950/90 text-rose-400 border border-rose-800">
                      Riskli / Elendi
                    </span>
                  )}

                  {isIouTam ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-600 flex items-center space-x-1">
                      <Sparkles className="h-3 w-3 text-emerald-400" />
                      <span>IOU: TAM UYUM</span>
                    </span>
                  ) : token.iouMatch === 'KISMİ' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-900 text-slate-400 border border-slate-800">
                      IOU: Kısmi
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-900 text-slate-500 border border-slate-800">
                      IOU: Kapsam Dışı
                    </span>
                  )}
                </div>

                {/* Top Row: Symbol, Price, Change */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-base">{token.symbol}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[120px]">{token.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <span
                        className="text-[11px] text-slate-400 font-mono truncate max-w-[155px]"
                        title={token.address}
                      >
                        {token.address}
                      </span>
                      <button
                        id={`copy-token-btn-${token.address}`}
                        onClick={(e) => handleCopyAddress(e, token.address)}
                        className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                          copiedAddress === token.address
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                        }`}
                        title="Tam kontrat adresini kopyala"
                      >
                        {copiedAddress === token.address ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-slate-400" />
                            <span>Kopyala</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-white">
                      ${token.priceUsd.toFixed(6)}
                    </div>
                    <div
                      className={`text-xs font-mono font-medium ${
                        token.priceChange1m >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {token.priceChange1m >= 0 ? '+' : ''}{token.priceChange1m.toFixed(2)}% (1m)
                    </div>
                  </div>
                </div>

                {/* Continuation Probability Score Bar */}
                <div className="mt-3.5">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400 flex items-center space-x-1">
                      <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
                      <span>Dinamik Skor:</span>
                    </span>
                    <span className="font-mono font-bold text-white">
                      %{token.continuationProbability}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isIouTam
                          ? 'bg-emerald-400'
                          : isSaturated
                          ? 'bg-amber-400'
                          : isHigh
                          ? 'bg-sky-400'
                          : 'bg-rose-400'
                      }`}
                      style={{ width: `${token.continuationProbability}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                        token.waitingFor5mCandle
                          ? 'text-amber-300 bg-amber-950/80 border-amber-600'
                          : isIouTam
                          ? 'text-emerald-300 bg-emerald-950/80 border-emerald-700'
                          : isSaturated
                          ? 'text-amber-300 bg-amber-950/80 border-amber-800'
                          : isHigh
                          ? 'text-sky-400 bg-sky-950/80 border-sky-800'
                          : 'text-rose-400 bg-rose-950/80 border-rose-800'
                      }`}
                    >
                      {token.waitingFor5mCandle
                        ? `5m Mum Bekleniyor (${Math.ceil((token.timeRemaining5mMs || 0) / 1000)}s)`
                        : isIouTam
                        ? 'Alım Uygun (IOU Fırsatı)'
                        : isSaturated
                        ? 'Alım YASAK (Doygun)'
                        : isHigh
                        ? 'Yüksek İvme (Onay Bekliyor)'
                        : 'Elendi / Riskli'}
                    </span>
                    <div className="text-[11px] font-mono text-right">
                      <span className="text-slate-400">
                        İşlem Alım: %{Math.round(token.buyRatio1m * 100)}
                      </span>
                      {token.buyVolumeRatio1m !== undefined && (
                        <span className={`ml-2 font-medium ${token.buyVolumeRatio1m >= 0.60 ? 'text-emerald-400' : token.buyVolumeRatio1m < 0.50 ? 'text-rose-400' : 'text-slate-300'}`}>
                          • USD Akış: %{Math.round(token.buyVolumeRatio1m * 100)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Market Details Grid */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500">Piyasa Değeri:</span>
                    <span
                      className={`font-mono ml-1 font-medium ${
                        isSaturated ? 'text-amber-400' : 'text-slate-300'
                      }`}
                    >
                      ${(token.marketCapUsd / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Likidite:</span>
                    <span className="font-mono text-slate-300 ml-1">
                      ${(token.liquidityUsd / 1000).toFixed(1)}k
                      {token.initialLiquidityUsd ? (
                        <span className="text-[10px] text-slate-500 ml-1">
                          (İlk: ${(token.initialLiquidityUsd / 1000).toFixed(1)}k)
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">1m Hacim:</span>
                    <span className="font-mono text-slate-300 ml-1">
                      ${token.volume1m.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Akıllı Para:</span>
                    <span
                      className={`font-mono ml-1 font-medium ${
                        token.smartMoneyInflowUsd >= 1000 ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      +${token.smartMoneyInflowUsd.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Security checks */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <div className="flex items-center space-x-2">
                    {token.security.isHoneypot ? (
                      <span className="flex items-center space-x-1 text-rose-400 font-medium">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Honeypot!</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Temiz Kontrat</span>
                      </span>
                    )}

                    <span className="text-slate-500">|</span>

                    <span className="text-slate-400">
                      İlk 10: %{Math.round(token.security.top10HolderRate * 100)}
                    </span>

                    {token.security.top70SniperHoldRate !== undefined && (
                      <>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-400">
                          Sniper: %{Math.round(token.security.top70SniperHoldRate * 100)}
                        </span>
                      </>
                    )}

                    {token.security.botDegenRate !== undefined && (
                      <>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-400">
                          Bot: %{Math.round(token.security.botDegenRate * 100)}
                        </span>
                      </>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    Vergi: {token.security.buyTax}% / {token.security.sellTax}%
                  </span>
                </div>
              </div>

              {/* Bot Decision Note */}
              <div
                className={`mt-3 p-2.5 rounded-lg border text-[11px] ${
                  isIouTam
                    ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                    : isSaturated
                    ? 'bg-amber-950/30 border-amber-900/60 text-amber-200/90'
                    : 'bg-slate-900/90 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-medium mb-1">
                  {isIouTam ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : isSaturated ? (
                    <Ban className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span>Bot Karar Gerekçesi:</span>
                </div>
                <div className="leading-relaxed">
                  {token.decisionReason || 'Analiz ediliyor...'}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};
