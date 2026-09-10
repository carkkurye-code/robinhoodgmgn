import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  Sliders,
  FileCode,
} from 'lucide-react';
import type { VerificationItem } from '../types';

interface VerificationMatrixProps {
  items: VerificationItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onOpenConfig: () => void;
}

export const VerificationMatrix: React.FC<VerificationMatrixProps> = ({
  items,
  isLoading,
  onRefresh,
  onOpenConfig,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">
              8 Maddelik GMGN & Robinhood Chain Servis Doğrulama Raporu
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kullanıcı talimatı: Test edilmemiş hiçbir özellik varmış gibi kabul edilmez; sadece test edilen, hazır olan ve henüz test edilmeyenler şeffaf olarak ayrılmıştır.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 font-medium transition-colors"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Yenile</span>
          </button>

          <button
            onClick={onOpenConfig}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-md shadow-emerald-950"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Servis Yapılandır & Test Et</span>
          </button>
        </div>
      </div>

      {/* Verification Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/80 flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <div>
            <div className="font-bold text-emerald-300">GERÇEKTEN TEST EDİLDİ</div>
            <div className="text-[11px] text-slate-400">Çalıştırılarak teyit edilmiş operasyonlar.</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/80 flex items-center space-x-2">
          <FileCode className="h-4 w-4 text-sky-400 shrink-0" />
          <div>
            <div className="font-bold text-sky-300">KOD OLARAK HAZIR</div>
            <div className="text-[11px] text-slate-400">Tüm fonksiyonları yazılmış, canlı anahtar bekleyenler.</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/80 flex items-center space-x-2">
          <Clock className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <div className="font-bold text-amber-300">HENÜZ TEST EDİLMEDİ</div>
            <div className="text-[11px] text-slate-400">Canlı ağa henüz gerçek istek atılmamış maddeler.</div>
          </div>
        </div>
      </div>

      {/* Verification Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-3 px-3 font-medium w-10">#</th>
              <th className="py-3 px-3 font-medium">Bileşen / Madde</th>
              <th className="py-3 px-3 font-medium">Kategori</th>
              <th className="py-3 px-3 font-medium">Durum</th>
              <th className="py-3 px-3 font-medium">Doğrulama & Teşhis Açıklaması</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {items.map((item) => {
              const isVerified = item.status === 'VERIFIED';
              const isCodeReady = item.status === 'CODE_READY';
              const isNotTested = item.status === 'NOT_TESTED';

              const badgeClass = isVerified
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : isCodeReady
                ? 'bg-sky-950 text-sky-300 border-sky-800'
                : 'bg-amber-950 text-amber-300 border-amber-800';

              const badgeText = isVerified
                ? 'GERÇEKTEN TEST EDİLDİ'
                : isCodeReady
                ? 'KOD OLARAK HAZIR'
                : 'HENÜZ TEST EDİLMEDİ';

              return (
                <tr key={item.id} className="hover:bg-slate-850/40 transition-colors">
                  <td className="py-3.5 px-3 font-mono text-slate-500 font-bold">{item.id}</td>
                  <td className="py-3.5 px-3 font-semibold text-white">
                    {item.title}
                    <div className="text-[11px] text-slate-400 font-normal mt-0.5">{item.description}</div>
                  </td>
                  <td className="py-3.5 px-3 text-slate-400 whitespace-nowrap">{item.topic}</td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                      {badgeText}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-slate-300 leading-relaxed max-w-md">
                    {item.diagnosticNote}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
