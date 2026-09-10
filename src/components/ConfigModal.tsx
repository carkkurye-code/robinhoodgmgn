import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Send,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [gmgnKey, setGmgnKey] = useState('');
  const [gmgnPrivKey, setGmgnPrivKey] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [mode, setMode] = useState<'PAPER_TRADING' | 'LIVE_EXECUTION'>('PAPER_TRADING');

  const [testTgStatus, setTestTgStatus] = useState<{ loading: boolean; message?: string; error?: string } | null>(null);
  const [testQuoteStatus, setTestQuoteStatus] = useState<{ loading: boolean; result?: any; error?: string } | null>(null);
  const [testSigStatus, setTestSigStatus] = useState<{ loading: boolean; result?: any } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/config')
        .then((res) => res.json())
        .then((data) => {
          if (data.telegramChatId) setTgChatId(data.telegramChatId);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gmgnKey,
          gmgnPrivKey,
          tgToken,
          tgChatId,
          mode,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestTelegram = async () => {
    setTestTgStatus({ loading: true });
    try {
      if (tgToken || tgChatId) {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tgToken, tgChatId }),
        });
      }

      const res = await fetch('/api/test/telegram', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestTgStatus({ loading: false, message: 'Test mesajı Telegram kanalına iletildi!' });
      } else {
        setTestTgStatus({ loading: false, error: data.error || 'Gönderilemedi' });
      }
    } catch (err: any) {
      setTestTgStatus({ loading: false, error: err.message });
    }
  };

  const handleTestQuote = async () => {
    setTestQuoteStatus({ loading: true });
    try {
      const res = await fetch('/api/test/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsdt: 50 }),
      });
      const data = await res.json();
      setTestQuoteStatus({ loading: false, result: data.quote });
    } catch (err: any) {
      setTestQuoteStatus({ loading: false, error: err.message });
    }
  };

  const handleTestSignature = async () => {
    setTestSigStatus({ loading: true });
    try {
      const res = await fetch('/api/test/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subPath: '/v1/trade/swap',
          queryParams: { chain: 'rh', token_in: 'USDT' },
        }),
      });
      const data = await res.json();
      setTestSigStatus({ loading: false, result: data.result });
    } catch (err) {
      setTestSigStatus({ loading: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">
              GMGN.ai ve Telegram Servis Yapılandırması
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs text-slate-300">
          {/* Important Security Notice */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1 text-slate-400">
            <div className="flex items-center space-x-1.5 text-amber-300 font-medium">
              <ShieldAlert className="h-4 w-4" />
              <span>Güvenlik ve Telegram Kuralı:</span>
            </div>
            <p>
              • Telegram işlem cüzdanı değildir; Telegram&apos;a USDT veya varlık gönderilmez.
              <br />
              • İlk aşamada gerçek para ile işlem yapılmaz; paper-trading ile GMGN &rarr; Robinhood Chain veri/quote akışı doğrulanır.
            </p>
          </div>

          {/* GMGN API Credentials */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white border-b border-slate-800 pb-2">
              1. GMGN.ai API & Ed25519 İmzalama
            </h4>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                GMGN API Key (Bearer Token)
              </label>
              <input
                type="password"
                value={gmgnKey}
                onChange={(e) => setGmgnKey(e.target.value)}
                placeholder="Örn: gmgn_sec_..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                GMGN platformunda profilinizden ürettiğiniz OpenAPI / Agent API erişim anahtarı.
              </span>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Ed25519 / RSA Özel Anahtar (Trade Signing)
              </label>
              <textarea
                rows={3}
                value={gmgnPrivKey}
                onChange={(e) => setGmgnPrivKey(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY----- ... veya Base64 Seed"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Kritik takas isteklerinin Ed25519 ile X-Signature başlığı altında imzalanması için kullanılır.
              </span>
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <button
                type="button"
                onClick={handleTestSignature}
                disabled={testSigStatus?.loading}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium"
              >
                Ed25519 İmza Üretimini Test Et
              </button>

              <button
                type="button"
                onClick={handleTestQuote}
                disabled={testQuoteStatus?.loading}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium"
              >
                Robinhood Chain (4663) Quote Test Et
              </button>
            </div>

            {testSigStatus?.result && (
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] space-y-1">
                <div className="text-emerald-400 font-semibold">İmza Üretildi ({testSigStatus.result.algorithm}):</div>
                <div className="text-slate-400 truncate">Kanonik Metin: {testSigStatus.result.canonicalString}</div>
                <div className="text-slate-300 truncate">X-Signature: {testSigStatus.result.signature}</div>
              </div>
            )}

            {testQuoteStatus?.result && (
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] space-y-1">
                <div className="text-emerald-400 font-semibold">Robinhood Chain (4663) GMGN Quote Sonucu:</div>
                <div className="text-slate-300">
                  Giriş: {testQuoteStatus.result.amountIn} USDT &rarr; Tahmini Alım: {testQuoteStatus.result.expectedOut} Token
                </div>
                <div className="text-slate-400">
                  Fiyat Etkisi: %{testQuoteStatus.result.priceImpact} &bull; Kayma: %{testQuoteStatus.result.effectiveSlippage} &bull; Router: {testQuoteStatus.result.routerAddress}
                </div>
              </div>
            )}
          </div>

          {/* Telegram Credentials */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white border-b border-slate-800 pb-2">
              2. Telegram Bildirim & Kontrol Entegrasyonu
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Telegram Bot Token
                </label>
                <input
                  type="password"
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjkl..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="Örn: 987654321"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={testTgStatus?.loading}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Telegram Bildirim Testi Gönder</span>
              </button>

              {testTgStatus?.message && (
                <span className="text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{testTgStatus.message}</span>
                </span>
              )}
              {testTgStatus?.error && (
                <span className="text-rose-400 flex items-center space-x-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{testTgStatus.error}</span>
                </span>
              )}
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white border-b border-slate-800 pb-2">
              3. Çalışma Modu
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('PAPER_TRADING')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'PAPER_TRADING'
                    ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-white">Paper-Trading (Önerilen)</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Gerçek para riske atılmaz. GMGN verileri ve Robinhood Chain takas simülasyonu çalışır.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('LIVE_EXECUTION')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'LIVE_EXECUTION'
                    ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-white">Canlı İşlem (Live)</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tüm 8 doğrulama maddesi onaylandıktan sonra gerçek cüzdan imzasıyla takas yürütülür.
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            Değişiklikleri Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};
