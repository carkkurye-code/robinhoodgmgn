import React from 'react';
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
} from 'lucide-react';
import type { ScannedToken } from '../types';

interface TokenScannerProps {
  tokens: ScannedToken[];
  lastScanTime: number;
}

export const TokenScanner: React.FC<TokenScannerProps> = ({ tokens, lastScanTime }) => {
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
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            GMGN OpenAPI & Quotation motorundan taranan yeni havuzlar ve yükseliş ivmesi analizleri.
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

      {/* Token Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {tokens.map((token) => {
          const isHigh = token.continuationVerdict === 'HIGH_CONTINUATION';
          const isExhausted = token.continuationVerdict === 'LOW_EXHAUSTED';

          const scoreColor = isHigh
            ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800'
            : isExhausted
            ? 'text-rose-400 bg-rose-950/80 border-rose-800'
            : 'text-amber-400 bg-amber-950/80 border-amber-800';

          const verdictLabel = isHigh
            ? 'Yüksek İvme (Alım Uygun)'
            : isExhausted
            ? 'İvme Tükenmiş / Riskli'
            : 'Nötr / Beklemede';

          return (
            <div
              key={token.address}
              className={`rounded-xl p-4 border transition-all flex flex-col justify-between ${
                isHigh
                  ? 'bg-slate-950 border-emerald-900/60 shadow-lg shadow-emerald-950/20'
                  : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Top Row */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-base">{token.symbol}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[120px]">{token.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                      {token.address}
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
                      <span>Dinamik Yükseliş Devam Skoru:</span>
                    </span>
                    <span className="font-mono font-bold text-white">
                      %{token.continuationProbability}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isHigh ? 'bg-emerald-400' : isExhausted ? 'bg-rose-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${token.continuationProbability}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${scoreColor}`}>
                      {verdictLabel}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Alım Oranı: %{Math.round(token.buyRatio1m * 100)}
                    </span>
                  </div>
                </div>

                {/* Market Details Grid */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500">Likidite:</span>
                    <span className="font-mono text-slate-300 ml-1">
                      ${(token.liquidityUsd / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">1m Hacim:</span>
                    <span className="font-mono text-slate-300 ml-1">
                      ${token.volume1m.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Piyasa Değeri:</span>
                    <span className="font-mono text-slate-300 ml-1">
                      ${(token.marketCapUsd / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Akıllı Para:</span>
                    <span className="font-mono text-emerald-400 ml-1">
                      +${token.smartMoneyInflowUsd.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Security checks */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
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
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    Vergi: {token.security.buyTax}% / {token.security.sellTax}%
                  </span>
                </div>
              </div>

              {/* Bot Decision Note */}
              <div className="mt-3 p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400">
                <span className="text-slate-500 font-medium">Karar Gerekçesi: </span>
                {token.decisionReason || 'Analiz ediliyor...'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
