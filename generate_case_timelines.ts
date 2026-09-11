import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const targetSymbols = ['IF', 'DJI6930', 'OOF', 'GTA6', 'VEEFO', 'PUCHATO'];

const resultsFile = JSON.parse(fs.readFileSync('migration_analysis_results.json', 'utf8'));
const events = resultsFile.events;

console.log('=== CASE STUDY TIMELINES ===\n');

for (const sym of targetSymbols) {
  const ev = events.find((e: any) => e.symbol === sym);
  if (!ev) {
    console.log(`Symbol ${sym} not found in events`);
    continue;
  }

  // Get raw 1m klines
  const res = spawnSync('./node_modules/.bin/gmgn-cli', ['market', 'kline', '--chain', 'robinhood', '--address', ev.address, '--resolution', '1m', '--raw'], { encoding: 'utf8' });
  if (!res.stdout) continue;
  const klines = JSON.parse(res.stdout).list.sort((a: any, b: any) => Number(a.time) - Number(b.time));

  const openMs = ev.openTimestamp * 1000;
  let t0Idx = klines.findIndex((c: any) => Math.abs(Number(c.time) - openMs) <= 90000);
  if (t0Idx === -1) {
    let minDiff = Infinity;
    klines.forEach((c: any, i: number) => {
      const diff = Math.abs(Number(c.time) - openMs);
      if (diff < minDiff) {
        minDiff = diff;
        t0Idx = i;
      }
    });
  }

  console.log(`--------------------------------------------------`);
  console.log(`TOKEN: ${ev.symbol} (${ev.name})`);
  console.log(`Contract: ${ev.address}`);
  console.log(`Migration T0: ${ev.t0_time_iso} (open_ts: ${ev.openTimestamp})`);
  console.log(`Launchpad: ${ev.launchpad} -> DEX: ${ev.exchange} (Pool: ${ev.poolAddress})`);
  console.log(`Holders: ${ev.holderCount}, Top10: ${(ev.top10HolderRate * 100).toFixed(1)}%, SM: ${ev.smartMoneyCount}, KOL: ${ev.kolCount}, Dev: ${ev.devStatus}`);
  console.log(`T0 Price: $${ev.t0_price.toFixed(8)}, T0 MC: $${Math.round(ev.t0_mc)}, T0 Liq: $${Math.round(ev.t0_liq)}`);
  console.log(`30m Max Gain: +${ev.maxGain30m.toFixed(1)}%, 30m Return: ${ev.finalReturn30m.toFixed(1)}%`);

  const points = [
    { label: 'T-5m', offset: -5 },
    { label: 'T-2m', offset: -2 },
    { label: 'T-1m', offset: -1 },
    { label: 'T0 (Migration)', offset: 0 },
    { label: 'T+1m', offset: 1 },
    { label: 'T+2m', offset: 2 },
    { label: 'T+5m', offset: 5 },
    { label: 'T+15m', offset: 15 },
    { label: 'T+30m', offset: 30 },
  ];

  console.log('\nTIMELINE:');
  points.forEach((p) => {
    const idx = t0Idx + p.offset;
    if (idx >= 0 && idx < klines.length) {
      const c = klines[idx];
      const pr = parseFloat(c.close);
      const vol = parseFloat(c.volume || '0');
      const mc = pr * 1000000000;
      const chg = ev.t0_price > 0 ? (((pr - ev.t0_price) / ev.t0_price) * 100).toFixed(1) : '0.0';
      const timeStr = new Date(Number(c.time)).toISOString().substring(11, 19);
      console.log(`  ${p.label.padEnd(16)} [${timeStr}] Price: $${pr.toFixed(8)} | MC: $${Math.round(mc).toString().padStart(6)} | Vol: $${Math.round(vol).toString().padStart(5)} | Chg vs T0: ${chg}%`);
    } else {
      console.log(`  ${p.label.padEnd(16)} [No candle data at offset ${p.offset}]`);
    }
  });
  console.log('\n');
}
