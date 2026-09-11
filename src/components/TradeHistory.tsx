import React from 'react';
import {
  History,
  Send,
  CheckCircle2,
} from 'lucide-react';
import type { ExecutedTrade } from '../types';

interface TradeHistoryProps {
  trades: ExecutedTrade[];
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({ trades }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">
              İşlem ve Telegram Bildirim Günlüğü ({trades.length})
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Dinamik alım ve çıkış kararları anlık olarak Telegram kanalına iletilir. (Telegram işlem cüzdanı değildir).
          </p>
        </div>

        <div className="text-xs text-slate-400">
          Otomatik Bildirim: <span className="text-emerald-400 font-medium">Aktif</span>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          Henüz işlem geçmişi yok. Bot uygun dinamik giriş koşulları oluştuğunda alım yapacaktır.
        </div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3 font-medium">Zaman</th>
                <th className="py-2.5 px-3 font-medium">İşlem</th>
                <th className="py-2.5 px-3 font-medium">Token (RH-4663)</th>
                <th className="py-2.5 px-3 font-medium">Fiyat / Tutar</th>
                <th className="py-2.5 px-3 font-medium">Kâr/Zarar</th>
                <th className="py-2.5 px-3 font-medium">Dinamik Gerekçe</th>
                <th className="py-2.5 px-3 font-medium">Telegram</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {trades.map((trade) => {
                const isBuy = trade.action === 'BUY';
                const hasPnl = trade.pnlPercent !== undefined;
                const isProfit = (trade.pnlPercent || 0) >= 0;
                // Primary key is trade.id; append trade.action as defensive guard for legacy records
                const rowKey = trade.id.includes(trade.action.toLowerCase()) ? trade.id : `${trade.id}_${trade.action}`;

                return (
                  <tr key={rowKey} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(trade.timestamp).toLocaleTimeString('tr-TR')}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          isBuy
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                        }`}
                      >
                        {isBuy ? 'ALIM (BUY)' : 'DİNAMİK SATIŞ (SELL)'}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-white">{trade.tokenSymbol}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                        {trade.tokenAddress}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono text-slate-200">${trade.priceUsd.toFixed(6)}</div>
                      <div className="text-[11px] text-slate-400 font-mono">${trade.usdtAmount.toFixed(2)} USDT</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-mono">
                      {hasPnl ? (
                        <div>
                          <div className={isProfit ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            <span className="text-[10px] text-slate-500 mr-1 font-normal">NET:</span>
                            {isProfit ? '+' : ''}{(trade.netPnlPercent ?? trade.pnlPercent)?.toFixed(2)}%
                          </div>
                          <span className="text-xs text-slate-400 block font-normal">
                            {(trade.netPnlUsd ?? trade.pnlUsd ?? 0) >= 0 ? '+' : ''}${(trade.netPnlUsd ?? trade.pnlUsd ?? 0).toFixed(2)}
                          </span>
                          {trade.grossPnlPercent !== undefined && (
                            <span className="text-[10px] text-slate-500 block font-normal mt-0.5">
                              Brüt: {trade.grossPnlPercent >= 0 ? '+' : ''}{trade.grossPnlPercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300 max-w-xs">
                      <div className="truncate" title={trade.reason}>
                        {trade.reason}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        İşlem Anı Skor: %{trade.continuationScoreAtTrade.toFixed(0)}
                      </div>
                      {trade.migrationAnalysis && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 font-mono text-slate-300"
                            title={trade.migrationAnalysis.reasons?.join(' | ')}
                          >
                            {trade.migrationAnalysis.statusBadge}
                          </span>
                          {trade.migrationAnalysis.migrationDetected && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              1m Net: {trade.migrationAnalysis.netFlow1m >= 0 ? '+' : ''}${Math.round(trade.migrationAnalysis.netFlow1m)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {trade.telegramNotified ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>İletildi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-slate-500 text-[11px]">
                          <Send className="h-3 w-3" />
                          <span>Kuyrukta / Test</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
