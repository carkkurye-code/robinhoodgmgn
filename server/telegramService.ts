import type { ExecutedTrade } from './types.js';

export class TelegramService {
  private botToken?: string;
  private chatId?: string;
  private lastUpdateId: number = 0;
  private isPolling: boolean = false;
  private pollInterval?: NodeJS.Timeout;
  private onTradeAmountChange?: (amount: number) => void;
  private getTradeAmountFn?: () => number;

  constructor(botToken?: string, chatId?: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  public updateCredentials(token?: string, chatId?: string) {
    if (token !== undefined) this.botToken = token;
    if (chatId !== undefined) this.chatId = chatId;
  }

  public startPolling(onTradeAmountChange: (amount: number) => void, getTradeAmountFn?: () => number) {
    this.onTradeAmountChange = onTradeAmountChange;
    this.getTradeAmountFn = getTradeAmountFn;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    if (!this.botToken) return;

    // Run first poll immediately
    this.pollUpdates().catch((err) => console.error('[Telegram Initial Poll Error]:', err));

    // Poll every 3 seconds for fast response to commands like /5, /10
    this.pollInterval = setInterval(() => {
      this.pollUpdates().catch((err) => console.error('[Telegram Poll Error]:', err));
    }, 3000);
  }

  public stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  public async pollUpdates(): Promise<void> {
    if (!this.botToken) return;
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&limit=20&timeout=0`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          if (update.update_id >= this.lastUpdateId) {
            this.lastUpdateId = update.update_id;
          }
          if (update.message) {
            await this.handleIncomingMessage(update.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[Telegram Poll Error]:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  private async handleIncomingMessage(message: any) {
    const text = (message.text || '').trim();
    const incomingChatId = String(message.chat?.id || this.chatId || '');

    if (!this.chatId && incomingChatId) {
      this.chatId = incomingChatId;
    }

    if (!text.startsWith('/')) return;

    // 1. Direct number commands: /5, /10, /7, /8, /50 or /5@botname
    const directNumberMatch = text.match(/^\/(\d+(?:\.\d+)?)(?:@\w+)?$/);
    // 2. Explicit command keywords: /amount 10, /trade 5, /miktar 7, /set 8
    const commandAmountMatch = text.match(/^\/(?:amount|trade|set|miktar)\s+(\d+(?:\.\d+)?)(?:@\w+)?$/i);
    const amountMatch = directNumberMatch || commandAmountMatch;

    if (amountMatch) {
      const newAmount = parseFloat(amountMatch[1]);
      if (newAmount > 0 && isFinite(newAmount)) {
        if (this.onTradeAmountChange) {
          this.onTradeAmountChange(newAmount);
        }

        const effectiveAmount = this.getTradeAmountFn ? this.getTradeAmountFn() : newAmount;

        await this.sendMessage(
          `✅ <b>İşlem Miktarı Güncellendi</b>\n` +
          `--------------------------------\n` +
          `Sonraki alım emrinde kullanılacak tutar: <b>$${effectiveAmount.toFixed(2)} USDT</b>\n` +
          `Çalışma Modu: <b>PAPER_TRADING</b>\n` +
          `<i>Yeni işlem büyüklüğü sisteme tanımlandı ve sonraki BUY işleminde kullanılacaktır.</i>`,
          incomingChatId
        );
        return;
      }
    }

    // Help & Start command
    if (text.startsWith('/start') || text.startsWith('/help')) {
      const current = this.getTradeAmountFn ? this.getTradeAmountFn() : 50;
      await this.sendMessage(
        `🤖 <b>Robinhood Chain (4663) GMGN Alım Botu</b>\n` +
        `--------------------------------\n` +
        `İşlem miktarını belirlemek için doğrudan slash ile rakam yazabilirsiniz:\n` +
        `• <code>/5</code>  ➜ 5 USDT ile alım yap\n` +
        `• <code>/7</code>  ➜ 7 USDT ile alım yap\n` +
        `• <code>/8</code>  ➜ 8 USDT ile alım yap\n` +
        `• <code>/10</code> ➜ 10 USDT ile alım yap\n` +
        `• <code>/50</code> ➜ 50 USDT ile alım yap\n` +
        `--------------------------------\n` +
        `<b>Aktif İşlem Miktarı:</b> $${current.toFixed(2)} USDT\n` +
        `<b>Mod:</b> PAPER_TRADING`,
        incomingChatId
      );
      return;
    }

    // Status command
    if (text.startsWith('/status') || text.startsWith('/durum')) {
      const current = this.getTradeAmountFn ? this.getTradeAmountFn() : 50;
      await this.sendMessage(
        `📊 <b>Bot Durumu</b>\n` +
        `--------------------------------\n` +
        `<b>Aktif İşlem Miktarı:</b> $${current.toFixed(2)} USDT\n` +
        `<b>Mod:</b> PAPER_TRADING\n` +
        `İşlem miktarını değiştirmek için örneğin <code>/5</code> veya <code>/10</code> yazabilirsiniz.`,
        incomingChatId
      );
      return;
    }
  }

  public async sendMessage(text: string, targetChatId?: string): Promise<{ success: boolean; error?: string }> {
    const chatId = targetChatId || this.chatId;
    if (!this.botToken || !chatId) {
      console.log('[Telegram Simulated Notification]:', text);
      return { success: true, error: 'Telegram yapılandırılmadı (Konsola yazıldı)' };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      const data = await res.json();
      if (data.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.description || 'Telegram API error' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async notifyTrade(trade: ExecutedTrade): Promise<boolean> {
    const isBuy = trade.action === 'BUY';
    const title = isBuy
      ? '🟢 <b>YENİ ALIM EMRİ (Robinhood Chain - 4663)</b>'
      : '🔵 <b>DİNAMİK ÇIKIŞ EMRİ (Robinhood Chain - 4663)</b>';

    let pnlBlock = '';
    if (!isBuy) {
      const netPct = trade.netPnlPercent ?? trade.pnlPercent ?? 0;
      const netUsd = trade.netPnlUsd ?? trade.pnlUsd ?? 0;
      const grossPct = trade.grossPnlPercent ?? trade.pnlPercent ?? 0;
      const grossUsd = trade.grossPnlUsd ?? trade.pnlUsd ?? 0;

      const formatUsdOrUnknown = (val: number | null | undefined, suffix = ' USDT') =>
        val !== null && val !== undefined ? `$${val.toFixed(2)}${suffix}` : 'Bilinmiyor';

      const formatPctOrUnknown = (val: number | null | undefined) =>
        val !== null && val !== undefined ? `${val.toFixed(2)}%` : 'Bilinmiyor';

      const c = trade.costs;
      const buyGasStr = c ? formatUsdOrUnknown(c.buyGasUsd) : 'Bilinmiyor';
      const sellGasStr = c ? formatUsdOrUnknown(c.sellGasUsd) : 'Bilinmiyor';
      const buyTaxStr = c && c.buyTaxRate !== null ? `%${(c.buyTaxRate * 100).toFixed(1)} (${formatUsdOrUnknown(c.buyTaxUsd)})` : 'Bilinmiyor';
      const sellTaxStr = c && c.sellTaxRate !== null ? `%${(c.sellTaxRate * 100).toFixed(1)} (${formatUsdOrUnknown(c.sellTaxUsd)})` : 'Bilinmiyor';
      const buySlipStr = c ? formatPctOrUnknown(c.slippageBuyPercent) : 'Bilinmiyor';
      const sellSlipStr = c ? formatPctOrUnknown(c.slippageSellPercent) : 'Bilinmiyor';

      pnlBlock = `
--------------------------------
🎯 <b>NET KÂR/ZARAR:</b> <b>${netPct >= 0 ? '+' : ''}${netPct.toFixed(2)}% ($${netUsd >= 0 ? '+' : ''}${netUsd.toFixed(2)} USDT)</b>
📊 <b>Gross (Brüt) PnL:</b> ${grossPct >= 0 ? '+' : ''}${grossPct.toFixed(2)}% ($${grossUsd >= 0 ? '+' : ''}${grossUsd.toFixed(2)} USDT)
--------------------------------
<b>Maliyet Kırılımı (Gerçek Veriler):</b>
• GMGN Alış Komisyonu (%1): $${(c?.gmgnBuyFeeUsd ?? 0).toFixed(2)} USDT
• GMGN Satış Komisyonu (%1): $${(c?.gmgnSellFeeUsd ?? 0).toFixed(2)} USDT
• Alış Gas Maliyeti: ${buyGasStr}
• Satış Gas Maliyeti: ${sellGasStr}
• Token Alış Vergisi (Tax): ${buyTaxStr}
• Token Satış Vergisi (Tax): ${sellTaxStr}
• Alış Slippage / Kayma: ${buySlipStr}
• Satış Slippage / Kayma: ${sellSlipStr}
• Toplam Bilinen Maliyet: $${(c?.totalKnownCostsUsd ?? 0).toFixed(2)} USDT`;
    }

    const message = `${title}
--------------------------------
<b>Token:</b> ${trade.tokenSymbol} (${trade.tokenName})
<b>Kontrat:</b> <code>${trade.tokenAddress}</code>
<b>İşlem Fiyatı:</b> $${trade.priceUsd.toFixed(6)}
<b>${isBuy ? 'Alım Tutarı' : 'Satış Tutarı (Brüt)'}:</b> $${trade.usdtAmount.toFixed(2)} USDT (${trade.tokenAmount.toLocaleString()} Token)
<b>Dinamik Skor:</b> %${trade.continuationScoreAtTrade}${pnlBlock}
<b>${isBuy ? 'Alım' : 'Satış'} Nedeni:</b> ${trade.reason}
--------------------------------
<i>Bilgi: Telegram işlem cüzdanı değildir. İşlemler GMGN & Robinhood Chain üzerinden izlenir.</i>`;

    const result = await this.sendMessage(message);
    return result.success;
  }
}
