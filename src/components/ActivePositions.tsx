import React from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Gauge,
} from 'lucide-react';
import type { ActivePosition } from '../types';

interface ActivePositionsProps {
  positions: ActivePosition[];
}

export const ActivePositions: React.FC<ActivePositionsProps> = ({ positions }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Wallet className="h-5 w-5 text-sky-400" />
            <h2 className="text-base font-semibold text-white">
              GMGN Takibindeki Aktif Pozisyonlar ({positions.length})
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Alınan tokenlar GMGN verileri üzerinden izlenir; sabit kâr/zarar stopu yoktur, çıkış dinamik analizle belirlenir.
          </p>
        </div>

        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono">
          Ağ: Robinhood Chain (4663)
        </span>
      </div>

      {positions.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          Şu an açık pozisyon bulunmuyor. GMGN taraması uygun dinamik alım fırsatı bekliyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {positions.map((pos) => {
            const isProfit = pos.unrealizedPnlPercent >= 0;
            const momentumColor =
              pos.momentumStatus === 'strong'
                ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800'
                : pos.momentumStatus === 'weakening'
                ? 'text-amber-400 bg-amber-950/80 border-amber-800'
                : 'text-rose-400 bg-rose-950/80 border-rose-800';

            const momentumLabel =
              pos.momentumStatus === 'strong'
                ? 'Güçlü İvme (Tutuluyor)'
                : pos.momentumStatus === 'weakening'
                ? 'Zayıflıyor (Yakın Takip)'
                : 'Tükeniyor (Çıkış Yakın)';

            return (
              <div
                key={pos.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white text-base">{pos.tokenSymbol}</span>
                        <span className="text-xs text-slate-400 truncate max-w-[100px]">{pos.tokenName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                        {pos.tokenAddress}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">NET K/Z</div>
                      <div
                        className={`text-sm font-mono font-bold flex items-center justify-end ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfit ? (
                          <ArrowUpRight className="h-4 w-4 mr-0.5" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 mr-0.5" />
                        )}
                        {isProfit ? '+' : ''}{(pos.unrealizedNetPnlPercent ?? pos.unrealizedPnlPercent).toFixed(2)}%
                      </div>
                      <div className="text-xs font-mono text-slate-400">
                        {isProfit ? '+' : ''}${(pos.unrealizedNetPnlUsd ?? pos.unrealizedPnlUsd).toFixed(2)} USDT
                      </div>
                      {pos.unrealizedGrossPnlPercent !== undefined && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Brüt: {pos.unrealizedGrossPnlPercent >= 0 ? '+' : ''}{pos.unrealizedGrossPnlPercent.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing grid */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs">
                    <div>
                      <div className="text-slate-500 text-[11px]">GMGN Giriş Fiyatı</div>
                      <div className="font-mono text-slate-200 mt-0.5">${pos.entryPriceUsd.toFixed(6)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Anlık GMGN Fiyatı</div>
                      <div className="font-mono text-slate-200 mt-0.5">${pos.currentPriceUsd.toFixed(6)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Yatırılan Tutar</div>
                      <div className="font-mono text-slate-200 mt-0.5">${pos.usdtInvested.toFixed(2)} USDT</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Token Miktarı</div>
                      <div className="font-mono text-slate-200 mt-0.5">{pos.tokensHeld.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Momentum & Dynamic Exit Tracking */}
                  <div className="mt-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center space-x-1">
                        <Gauge className="h-3.5 w-3.5 text-sky-400" />
                        <span>Dinamik Durum:</span>
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${momentumColor}`}>
                        {momentumLabel}
                      </span>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-300 leading-snug">
                      {pos.latestAnalysis}
                    </div>
                  </div>
                </div>

                {/* Entry Time Footer */}
                <div className="mt-3 pt-2 border-t border-slate-850 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>Giriş: {new Date(pos.entryTime).toLocaleTimeString('tr-TR')}</span>
                  </span>
                  <span className="font-mono text-emerald-400/80">Robinhood-4663</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
