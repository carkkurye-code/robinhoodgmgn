import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TradingEngine } from './server/tradingEngine.js';
import type { VerificationItem } from './server/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Trading Engine
  const engine = new TradingEngine({
    apiKey: process.env.GMGN_API_KEY,
    privateKey: process.env.GMGN_PRIVATE_KEY,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    mode: 'PAPER_TRADING', // strictly paper trading initially
    chainId: 4663,
    chainSlug: 'rh',
  });

  // Auto-start paper trading cycle
  engine.start();

  // Verification Matrix Data
  const getVerificationItems = (): VerificationItem[] => [
    {
      id: 1,
      title: 'GMGN Robinhood Chain Desteği',
      topic: 'Zincir ve Protokol',
      status: 'NOT_TESTED',
      description: 'GMGN API ve Quotation rotalarında Robinhood Chain (Chain ID: 4663) "rh" ağ kodu.',
      diagnosticNote: 'GMGN API istemcisi ve imza mekanizması kodlandı; ancak gerçek API anahtarıyla canlı sunucuya henüz istek atılmadı.',
    },
    {
      id: 2,
      title: 'Robinhood Chain Token Tarama',
      topic: 'Piyasa Taraması',
      status: 'NOT_TESTED',
      description: 'Robinhood Chain havuz ve swap akışlarının GMGN üzerinden taranması.',
      diagnosticNote: 'Yeni havuz tarama ve sıralama uç noktaları kodlandı; canlı GMGN API ile henüz test edilmedi.',
    },
    {
      id: 3,
      title: 'Piyasa ve Güvenlik Verileri',
      topic: 'Risk Yönetimi',
      status: 'NOT_TESTED',
      description: 'Honeypot, mint yetkisi ve ilk 10 cüzdan konsantrasyonu analizi.',
      diagnosticNote: 'Güvenlik filtreleri ve dinamik devam puanlama motoru kodlandı; canlı veriyle test edilmedi.',
    },
    {
      id: 4,
      title: 'Robinhood Chain İçin Gerçek Quote',
      topic: 'Fiyatlandırma & Kayma',
      status: 'NOT_TESTED',
      description: 'Robinhood Chain üzerinde USDT ile token takası için GMGN quote sorgusu.',
      diagnosticNote: 'Quote hesaplayıcı ve fiyat etkisi mantığı hazır; canlı GMGN swap API yanıtı henüz alınmadı.',
    },
    {
      id: 5,
      title: 'GMGN Üzerinden Alım/Satım Desteği',
      topic: 'Emir İcrası',
      status: 'VERIFIED',
      description: 'Canlı alım/satım işlemlerinin güvenlik gereği kilitli tutulması.',
      diagnosticNote: 'Canlı swap güvenlik kilidi devrede. Hiçbir gerçek swap/order gönderilmediği doğrulandı.',
    },
    {
      id: 6,
      title: 'GMGN Cüzdan ve Varlık Yapısı',
      topic: 'Cüzdan Güvenliği',
      status: 'VERIFIED',
      description: 'USDT bakiyesi yönetimi ve Telegram fon ayrımı.',
      diagnosticNote: 'Telegram bir cüzdan değildir; fon aktarılmaz. Bakiyeler sadece GMGN üzerinde izlenir.',
    },
    {
      id: 7,
      title: 'API Auth & Ed25519 İmzalama',
      topic: 'Kimlik Doğrulama',
      status: 'CODE_READY',
      description: 'Kanonik metin oluşturma ve X-Signature / X-Timestamp başlık üretimi.',
      diagnosticNote: 'Ed25519 / HMAC kanonik imzalama algoritması kodlandı; gerçek özel anahtarla doğrulanmayı bekliyor.',
    },
    {
      id: 8,
      title: 'Telegram Bildirim Entegrasyonu',
      topic: 'Raporlama & Uyarı',
      status: 'CODE_READY',
      description: 'Dinamik alım ve satış kararlarının Telegram kanalına anlık raporlanması.',
      diagnosticNote: 'Telegram Bot API mesajlaşma ve HTML formatlama servisi kod olarak hazır; canlı bot token girildiğinde iletilebilir.',
    },
  ];

  // API Routes
  app.get('/api/status', (req, res) => {
    res.json({ success: true, state: engine.getState() });
  });

  app.post('/api/bot/start', (req, res) => {
    engine.start();
    res.json({ success: true, state: engine.getState() });
  });

  app.post('/api/bot/stop', (req, res) => {
    engine.stop();
    res.json({ success: true, state: engine.getState() });
  });

  app.post('/api/bot/scan-now', async (req, res) => {
    await engine.runCycle();
    res.json({ success: true, state: engine.getState() });
  });

  app.post('/api/bot/reset', (req, res) => {
    engine.reset();
    res.json({ success: true, state: engine.getState() });
  });

  app.post('/api/bot/trade-amount', (req, res) => {
    const { amount } = req.body;
    if (amount && Number(amount) > 0) {
      engine.setTradeAmount(Number(amount));
    }
    res.json({ success: true, state: engine.getState() });
  });

  app.get('/api/verification', (req, res) => {
    res.json({ success: true, items: getVerificationItems() });
  });

  app.get('/api/config', (req, res) => {
    const cfg = engine.getGMGNService().getConfig();
    res.json({
      hasApiKey: Boolean(cfg.apiKey),
      hasPrivateKey: Boolean(cfg.privateKey),
      telegramChatId: cfg.telegramChatId || '',
      hasTelegramToken: Boolean(cfg.telegramBotToken),
      mode: engine.getState().mode,
    });
  });

  app.post('/api/config', (req, res) => {
    const { gmgnKey, gmgnPrivKey, tgToken, tgChatId, mode } = req.body;
    engine.updateConfig({
      apiKey: gmgnKey || undefined,
      privateKey: gmgnPrivKey || undefined,
      telegramBotToken: tgToken || undefined,
      telegramChatId: tgChatId || undefined,
      mode: mode || undefined,
    });
    res.json({ success: true });
  });

  app.post('/api/test/telegram', async (req, res) => {
    const tgService = engine.getTelegramService();
    const testResult = await tgService.sendMessage(
      '🤖 <b>Robinhood Chain (4663) GMGN Trading Bot - Test Bildirimi</b>\n\nTelegram bildirim entegrasyonu başarıyla test edildi! (Telegram cüzdan değildir).'
    );
    res.json(testResult);
  });

  app.post('/api/test/quote', (req, res) => {
    const { amountUsdt = 50, tokenAddress = '0x4663a89f6b9c7b91d24ef090d8a1789c89e14660' } = req.body;
    const quote = engine.getGMGNService().getQuote(tokenAddress, amountUsdt);
    res.json({ success: true, quote });
  });

  app.post('/api/test/signature', (req, res) => {
    const { subPath = '/v1/trade/swap', queryParams = { chain: 'rh' }, body = null } = req.body;
    const result = engine.getGMGNService().generateSignature(subPath, queryParams, body);
    res.json({ success: true, result });
  });

  // Setup Vite dev server or serve static
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Robinhood GMGN Auto-Trader] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
