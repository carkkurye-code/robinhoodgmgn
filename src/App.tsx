import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TokenScanner } from './components/TokenScanner';
import { ActivePositions } from './components/ActivePositions';
import { TradeHistory } from './components/TradeHistory';
import { VerificationMatrix } from './components/VerificationMatrix';
import { ConfigModal } from './components/ConfigModal';
import type { BotState, VerificationItem } from './types';
import { Cpu } from 'lucide-react';

export default function App() {
  const [botState, setBotState] = useState<BotState | null>(null);
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'verification'>('dashboard');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Poll bot status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.state) {
          setBotState(data.state);
        }
      }
    } catch (err) {
      console.error('Bot durum çekme hatası:', err);
    }
  };

  // Poll verification matrix
  const fetchVerification = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch('/api/verification');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.items) {
          setVerificationItems(data.items);
        }
      }
    } catch (err) {
      console.error('Doğrulama matrisi çekme hatası:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchVerification();

    const interval = setInterval(() => {
      fetchStatus();
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const handleToggleBot = async () => {
    if (!botState) return;
    const endpoint = botState.isRunning ? '/api/bot/stop' : '/api/bot/start';
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.state) {
          setBotState(data.state);
        }
      }
    } catch (err) {
      console.error('Bot başlatma/durdurma hatası:', err);
    }
  };

  const handleScanNow = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/bot/scan-now', { method: 'POST' });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.state) {
          setBotState(data.state);
        }
      }
    } catch (err) {
      console.error('Anlık tarama hatası:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Simülasyon bakiyesini ve işlem geçmişini $500 olarak sıfırlamak istiyor musunuz?')) {
      try {
        const res = await fetch('/api/bot/reset', { method: 'POST' });
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.success && data.state) {
            setBotState(data.state);
          }
        }
      } catch (err) {
        console.error('Sıfırlama hatası:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        state={botState}
        onToggleBot={handleToggleBot}
        onScanNow={handleScanNow}
        onReset={handleReset}
        onOpenConfig={() => setIsConfigOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isScanning={isScanning}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Core Directives Banner */}
        <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold text-white">Robinhood Chain (Chain ID: 4663) & GMGN.ai Motoru: </span>
              <span className="text-slate-400">
                USDT &rarr; GMGN &rarr; Token Tarama &rarr; Dinamik Yükseliş Devam Analizi &rarr; GMGN Alım &rarr; Dinamik Çıkış &rarr; Telegram Bildirim.
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
              Aşama 1: Read-Only & Paper-Trading
            </span>
          </div>
        </div>

        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            {/* Active Monitored Positions */}
            <ActivePositions positions={botState?.activePositions || []} />

            {/* Robinhood Chain Token Scanner */}
            <TokenScanner
              tokens={botState?.scannedTokens || []}
              lastScanTime={botState?.lastScanTime || 0}
              radarStatus={botState?.radarStatus}
            />

            {/* Trade & Telegram Notification History */}
            <TradeHistory trades={botState?.tradeHistory || []} />
          </div>
        ) : (
          <VerificationMatrix
            items={verificationItems}
            isLoading={isVerifying}
            onRefresh={fetchVerification}
            onOpenConfig={() => setIsConfigOpen(true)}
          />
        )}
      </main>

      {/* Status Bar */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-3 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Robinhood Chain ID: <span className="font-mono text-slate-300">4663</span> &bull; GMGN Slug: <span className="font-mono text-slate-300">rh</span> &bull; Telegram Sadece Bildirim Arayüzüdür
          </div>
          <div>
            GMGN OpenAPI & Agent Entegrasyonu &bull; Ed25519 İmzalı Rotalama
          </div>
        </div>
      </footer>

      {/* Configuration Modal */}
      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onSaved={() => {
          fetchStatus();
          fetchVerification();
        }}
      />
    </div>
  );
}
