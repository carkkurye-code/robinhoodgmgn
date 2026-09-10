import React from 'react';
import {
  ShieldAlert,
  Play,
  Square,
  RefreshCw,
  RotateCcw,
  Settings,
  Activity,
  Layers,
  CheckSquare,
} from 'lucide-react';
import type { BotState } from '../types';

interface HeaderProps {
  state: BotState | null;
  onToggleBot: () => void;
  onScanNow: () => void;
  onReset: () => void;
  onOpenConfig: () => void;
  activeTab: 'dashboard' | 'verification';
  setActiveTab: (tab: 'dashboard' | 'verification') => void;
  isScanning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  onToggleBot,
  onScanNow,
  onReset,
  onOpenConfig,
  activeTab,
  setActiveTab,
  isScanning,
}) => {
  const isRunning = state?.isRunning ?? false;
  const mode = state?.mode ?? 'PAPER_TRADING';
  const balance = state?.balanceUsdt ?? 500;
  const initialBalance = state?.initialBalanceUsdt ?? 500;
  const totalProfit = balance - initialBalance;
  const isProfit = totalProfit >= 0;

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
          {/* Brand & Chain Info */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-950">
              RH
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  Robinhood Chain GMGN Auto-Trader
                </h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Chain ID: 4663
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-mono uppercase font-bold border ${
                    mode === 'PAPER_TRADING'
                      ? 'bg-amber-950/70 text-amber-400 border-amber-800'
                      : 'bg-emerald-950/70 text-emerald-400 border-emerald-800'
                  }`}
                >
                  {mode === 'PAPER_TRADING' ? 'Paper Trading' : 'Canlı İşlem'}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex items-center space-x-2 mt-0.5">
                <span>GMGN.ai Rotalı Dinamik Yükseliş & Çıkış Analiz Botu</span>
              </div>
            </div>
          </div>

          {/* Stats & Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Balance Badge */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                Portföy (USDT)
              </div>
              <div className="text-sm font-bold font-mono text-white flex items-center space-x-1.5">
                <span>${balance.toFixed(2)}</span>
                <span className={`text-xs ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({isProfit ? '+' : ''}{totalProfit.toFixed(2)})
                </span>
              </div>
            </div>

            {/* Trade Amount Badge */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                İşlem Miktarı
              </div>
              <div className="text-sm font-bold font-mono text-emerald-400 flex items-center space-x-1">
                <span>${state?.tradeAmountUsdt ?? 50}</span>
                <span className="text-[10px] text-slate-400 font-normal">(TG: /5, /10)</span>
              </div>
            </div>

            {/* Scan Now */}
            <button
              id="scan-now-button"
              onClick={onScanNow}
              disabled={isScanning}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Şimdi Tara"
            >
              <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Reset */}
            <button
              id="reset-balance-button"
              onClick={onReset}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Bakiyeyi Sıfırla"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {/* Settings */}
            <button
              id="config-settings-button"
              onClick={onOpenConfig}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="GMGN & Telegram Ayarları"
            >
              <Settings className="h-4 w-4" />
            </button>

            {/* Bot Start/Stop */}
            <button
              id="toggle-bot-button"
              onClick={onToggleBot}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg font-medium text-xs transition-all shadow-md ${
                isRunning
                  ? 'bg-rose-600/90 hover:bg-rose-500 text-white shadow-rose-950'
                  : 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-emerald-950'
              }`}
            >
              {isRunning ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              <span>{isRunning ? 'Durdur' : 'Başlat'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-4 border-t border-slate-800 pt-1 text-xs">
          <button
            id="tab-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-1.5 py-2.5 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>İşlem Masası & Canlı Takip</span>
          </button>

          <button
            id="tab-verification"
            onClick={() => setActiveTab('verification')}
            className={`flex items-center space-x-1.5 py-2.5 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'verification'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>8 Maddelik Servis Doğrulama Raporu</span>
          </button>
        </div>
      </div>
    </header>
  );
};
