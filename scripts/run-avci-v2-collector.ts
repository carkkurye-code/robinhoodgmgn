import fs from 'node:fs';
import path from 'node:path';
import { AvciV2ShadowCollector } from '../server/avciV2ShadowCollector.js';

async function runCollector() {
  console.log('=== BAŞLATILIYOR: AVCI V2 SHADOW DATA COLLECTOR ===');
  console.log('Mod: AVCI_V2_SHADOW=true (Production Alım-Satım Kapalı)');

  const collector = new AvciV2ShadowCollector();

  // 1. Fetch live tokens from Robinhood trenches
  console.log('GMGN Robinhood Trenches taranıyor...');
  const liveTrenches = collector.fetchLiveTrenches(50);
  console.log(`Canlı piyasadan ${liveTrenches.length} token alındı.`);

  let processedCount = 0;

  for (const rawToken of liveTrenches) {
    if (!rawToken.address) continue;
    collector.recordTokenObservation(rawToken);
    processedCount++;
  }

  // 2. Also incorporate audited historical tokens to record their T0 state accurately
  const sustainablePath = path.join(process.cwd(), 'sustainable_migration_results.json');
  if (fs.existsSync(sustainablePath)) {
    try {
      const susData = JSON.parse(fs.readFileSync(sustainablePath, 'utf8'));
      const tokens = susData.tokens || [];
      for (const t of tokens) {
        if (!t.address) continue;
        collector.recordTokenObservation({
          address: t.address,
          symbol: t.symbol,
          name: t.name || t.symbol,
          price: t.t0_price ?? null,
          market_cap: t.t0_mc ?? null,
          liquidity: t.t0_liq ?? null,
          volume_24h: t.cum_30s_vol ?? null,
          holder_count: null, // Strictly null when unavailable from source
          observedAt: t.t0_time_iso,
          isHistorical: true,
        });
        processedCount++;
      }
    } catch (e) {}
  }

  // 3. Generate summary
  const summary = collector.getCollectorSummary();
  console.log('\n--- AVCI V2 SHADOW COLLECTOR ÖZETİ ---');
  console.log(`Toplam Takip Edilen Token: ${summary.totalTokensTracked}`);
  console.log(`Erken Keşif ($1K-$10K MC): ${summary.earlyDiscoveryCount}`);
  console.log(`Geç Keşif ($50K+ MC): ${summary.lateDiscoveryCount}`);
  console.log(`Karar Dağılımı: Aday = ${summary.decisions.earlyBuyCandidate}, İzleme = ${summary.decisions.watch}, Red = ${summary.decisions.reject}`);
  console.log(`Sanal $1 Pozisyon Sayısı: ${summary.hypotheticalTrading.totalPositions}`);
  console.log(`Veritabanı Yolu: research/avci-v2/`);

  // Show sample tracked tokens
  console.log('\nÖrnek Kaydedilen Tokenlar:');
  summary.tokens.slice(0, 10).forEach((t: any, idx: number) => {
    console.log(
      `${idx + 1}. ${t.symbol.padEnd(10)} | ${t.discoveryType.padEnd(16)} | MC: $${(t.t0MarketCap || 0).toLocaleString().padEnd(8)} | Liq: $${(t.t0Liquidity || 0).toLocaleString().padEnd(8)} | Karar: ${t.decision || 'NONE'}`
    );
  });
}

runCollector().catch(err => {
  console.error('Collector hatası:', err);
  process.exit(1);
});
