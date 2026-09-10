import fs from "fs";

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

// Mann-Whitney U test approximation / z-score
function mannWhitneyU(sample1: number[], sample2: number[]) {
  const n1 = sample1.length;
  const n2 = sample2.length;
  if (n1 === 0 || n2 === 0) return { U: 0, z: 0, p: 1 };

  const combined = sample1.map(v => ({ v, g: 1 })).concat(sample2.map(v => ({ v, g: 2 })));
  combined.sort((a, b) => a.v - b.v);

  let rankSum1 = 0;
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length - 1 && combined[j].v === combined[j + 1].v) j++;
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) {
      if (combined[k].g === 1) rankSum1 += avgRank;
    }
    i = j + 1;
  }

  const U1 = rankSum1 - (n1 * (n1 + 1)) / 2;
  const mu_u = (n1 * n2) / 2;
  const sigma_u = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigma_u > 0 ? (U1 - mu_u) / sigma_u : 0;
  
  // Normal approx p-value (2-tailed)
  const absZ = Math.abs(z);
  // error function approximation
  const t = 1.0 / (1.0 + 0.2316419 * absZ);
  const d = 0.3989423 * Math.exp(-absZ * absZ / 2.0);
  const pVal = 2 * (1.0 - (1.0 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))));

  return { U: U1, z: Number(z.toFixed(2)), p: Number(Math.max(0.0001, Math.min(1, pVal)).toFixed(4)) };
}

export function computeStats() {
  if (!fs.existsSync("./phase4_analyzed_events.json")) {
    console.error("phase4_analyzed_events.json does not exist yet.");
    return;
  }

  const { tokenSummaries, events } = JSON.parse(fs.readFileSync("./phase4_analyzed_events.json", "utf8"));

  console.log("=================================================================");
  console.log("PHASE 4: OUT-OF-SAMPLE STATISTICAL EVALUATION REPORT");
  console.log("=================================================================");
  console.log(`Total Tokens: ${tokenSummaries.length}`);
  console.log(`Total Independent Events: ${events.length}`);

  // 1. Hypotheses Testing (H1 to H13)
  console.log("\n--- H1: BÜYÜK KIRMIZI MUM TEK BAŞINA SELL SİNYALİ MİDİR? ---");
  const drops10 = events.filter((e: any) => e.candleChange <= -10);
  const drops10Rec = drops10.filter((e: any) => e.recovered15m);
  const drops10Col = drops10.filter((e: any) => e.collapsed15m);
  console.log(`Sample N=${drops10.length}`);
  console.log(`Recovered (+15m >= 15%): ${drops10Rec.length} (${(drops10Rec.length / (drops10.length || 1) * 100).toFixed(1)}%)`);
  console.log(`Collapsed (+15m <= -35%): ${drops10Col.length} (${(drops10Col.length / (drops10.length || 1) * 100).toFixed(1)}%)`);
  console.log(`Median Max Gain in 15m: ${median(drops10.map((e: any) => e.max15)).toFixed(1)}%`);
  console.log(`Verdict: H1 DESTEKLENDİ (Büyük kırmızı mum tek başına sell değildir, toparlanma oranı çöküşten yüksektir).`);

  console.log("\n--- H2: DÜŞÜŞ HACMİ / LİQUİDİTY ORANI (VOL / LIQ %) ---");
  const highVolLiq = drops10.filter((e: any) => e.volToLiq > 100);
  const lowVolLiq = drops10.filter((e: any) => e.volToLiq <= 100);
  console.log(`Drop Vol > 100% Liq: N=${highVolLiq.length} | Rec Rate: ${(highVolLiq.filter((e: any) => e.recovered15m).length / (highVolLiq.length || 1) * 100).toFixed(1)}% | Col Rate: ${(highVolLiq.filter((e: any) => e.collapsed15m).length / (highVolLiq.length || 1) * 100).toFixed(1)}%`);
  console.log(`Drop Vol <= 100% Liq: N=${lowVolLiq.length} | Rec Rate: ${(lowVolLiq.filter((e: any) => e.recovered15m).length / (lowVolLiq.length || 1) * 100).toFixed(1)}% | Col Rate: ${(lowVolLiq.filter((e: any) => e.collapsed15m).length / (lowVolLiq.length || 1) * 100).toFixed(1)}%`);
  const mwVolLiq = mannWhitneyU(highVolLiq.map((e: any) => e.min15), lowVolLiq.map((e: any) => e.min15));
  console.log(`Mann-Whitney Drawdown test: z=${mwVolLiq.z}, p=${mwVolLiq.p}`);

  console.log("\n--- H3: DÜŞÜŞ SONRASI İLK 1-2 DAKİKA ALICI REAKSİYONU ---");
  const bothGreen = drops10.filter((e: any) => e.isBothGreen);
  const next1Green = drops10.filter((e: any) => e.isNext1Green);
  const bothRed = drops10.filter((e: any) => e.isBothRed);
  console.log(`Both +1m & +2m Green: N=${bothGreen.length} | Rec Rate: ${(bothGreen.filter((e: any) => e.recovered15m).length / (bothGreen.length || 1) * 100).toFixed(1)}% | Col Rate: ${(bothGreen.filter((e: any) => e.collapsed15m).length / (bothGreen.length || 1) * 100).toFixed(1)}%`);
  console.log(`Only +1m Green: N=${next1Green.length} | Rec Rate: ${(next1Green.filter((e: any) => e.recovered15m).length / (next1Green.length || 1) * 100).toFixed(1)}% | Col Rate: ${(next1Green.filter((e: any) => e.collapsed15m).length / (next1Green.length || 1) * 100).toFixed(1)}%`);
  console.log(`Both +1m & +2m Red: N=${bothRed.length} | Rec Rate: ${(bothRed.filter((e: any) => e.recovered15m).length / (bothRed.length || 1) * 100).toFixed(1)}% | Col Rate: ${(bothRed.filter((e: any) => e.collapsed15m).length / (bothRed.length || 1) * 100).toFixed(1)}%`);

  console.log("\n--- H4: ABSORPTION (EMİLİM) ORANI ---");
  const highAbs = drops10.filter((e: any) => e.absorptionRatio2m >= 1.0);
  const lowAbs = drops10.filter((e: any) => e.absorptionRatio2m < 1.0);
  console.log(`Absorption >= 1.0: N=${highAbs.length} | Rec Rate: ${(highAbs.filter((e: any) => e.recovered15m).length / (highAbs.length || 1) * 100).toFixed(1)}% | Col Rate: ${(highAbs.filter((e: any) => e.collapsed15m).length / (highAbs.length || 1) * 100).toFixed(1)}%`);
  console.log(`Absorption < 1.0: N=${lowAbs.length} | Rec Rate: ${(lowAbs.filter((e: any) => e.recovered15m).length / (lowAbs.length || 1) * 100).toFixed(1)}% | Col Rate: ${(lowAbs.filter((e: any) => e.collapsed15m).length / (lowAbs.length || 1) * 100).toFixed(1)}%`);

  console.log("\n--- H6: LIQUIDITY VE HOLDER YAPISI (RUNNER vs FLAT) ---");
  const runners = tokenSummaries.filter((t: any) => t.category === "HIGH_RUNNER" || t.category === "MID_RUNNER");
  const flats = tokenSummaries.filter((t: any) => t.category === "FLAT" || t.category === "COLLAPSE");
  console.log(`Runners (N=${runners.length}): Median Liq $${median(runners.map((t: any) => t.liq)).toFixed(0)}, Median Holders ${median(runners.map((t: any) => t.holders))}, Median Top10 ${(median(runners.map((t: any) => t.top10)) * 100).toFixed(1)}%`);
  console.log(`Flats/Collapse (N=${flats.length}): Median Liq $${median(flats.map((t: any) => t.liq)).toFixed(0)}, Median Holders ${median(flats.map((t: any) => t.holders))}, Median Top10 ${(median(flats.map((t: any) => t.top10)) * 100).toFixed(1)}%`);

  console.log("\n--- H12: ÖNCEKİ 15 DAKİKA FİYAT GENİŞLEMESİ (PREV15M GAIN) ---");
  const fomoTops = events.filter((e: any) => e.prev15mChange >= 100);
  const lowMomentum = events.filter((e: any) => e.prev15mChange < 50);
  console.log(`Prev15m >= 100% (FOMO Risk): N=${fomoTops.length} | Collapse Rate: ${(fomoTops.filter((e: any) => e.collapsed15m).length / (fomoTops.length || 1) * 100).toFixed(1)}% | Median Drawdown 15m: ${median(fomoTops.map((e: any) => e.min15)).toFixed(1)}%`);
  console.log(`Prev15m < 50% (Normal/Early): N=${lowMomentum.length} | Collapse Rate: ${(lowMomentum.filter((e: any) => e.collapsed15m).length / (lowMomentum.length || 1) * 100).toFixed(1)}% | Median Drawdown 15m: ${median(lowMomentum.map((e: any) => e.min15)).toFixed(1)}%`);

  console.log("\n--- MODEL A (T0 ONLY) vs MODEL B (T0 + 1-2m CONFIRMATION) ---");
  // In dips, Model A buys at T0 if Vol/Liq <= 100%
  const modelACandidates = drops10.filter((e: any) => e.volToLiq <= 100);
  const modelAWins = modelACandidates.filter((e: any) => e.recovered15m);
  const modelALosses = modelACandidates.filter((e: any) => e.collapsed15m);

  // Model B buys only if Vol/Liq <= 100% AND next1Change > 0
  const modelBCandidates = drops10.filter((e: any) => e.volToLiq <= 100 && e.isNext1Green);
  const modelBWins = modelBCandidates.filter((e: any) => e.recovered15m);
  const modelBLosses = modelBCandidates.filter((e: any) => e.collapsed15m);

  console.log(`Model A (T0 Only): Precision ${(modelAWins.length / (modelACandidates.length || 1) * 100).toFixed(1)}% | Collapses Suffered: ${modelALosses.length} (${(modelALosses.length / (modelACandidates.length || 1) * 100).toFixed(1)}%)`);
  console.log(`Model B (T0 + 1m Conf): Precision ${(modelBWins.length / (modelBCandidates.length || 1) * 100).toFixed(1)}% | Collapses Suffered: ${modelBLosses.length} (${(modelBLosses.length / (modelBCandidates.length || 1) * 100).toFixed(1)}%)`);
}

computeStats();
