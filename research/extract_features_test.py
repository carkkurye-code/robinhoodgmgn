import os
import json
import glob
from datetime import datetime
import numpy as np

tokens_dir = 'research/avci-v2/tokens'
snapshots_dir = 'research/avci-v2/snapshots'
decisions_dir = 'research/avci-v2/decisions'
outcomes_dir = 'research/avci-v2/outcomes'

# 1. Map all snapshot files by contract
print("Indexing snapshot files...")
snap_map = {}
for entry in os.scandir(snapshots_dir):
    if entry.name.endswith('.json'):
        parts = entry.name[:-5].split('_')
        if len(parts) == 2:
            c, s_sec = parts
            s_sec = s_sec.rstrip('s')
            try:
                sec = int(s_sec)
                if c not in snap_map:
                    snap_map[c] = {}
                snap_map[c][sec] = entry.path
            except ValueError:
                pass

print(f"Contracts with snapshots: {len(snap_map)}")

# 2. Get all 441 decisions and sort chronologically
dec_files = glob.glob(os.path.join(decisions_dir, '*.json'))
raw_items = []

for df in dec_files:
    c = os.path.basename(df).replace('.json', '')
    with open(df) as f:
        dec = json.load(f)
    tok_f = os.path.join(tokens_dir, f"{c}.json")
    tok = {}
    if os.path.exists(tok_f):
        with open(tok_f) as f:
            tok = json.load(f)
    out_f = os.path.join(outcomes_dir, f"{c}.json")
    out = {}
    if os.path.exists(out_f):
        with open(out_f) as f:
            out = json.load(f)
            
    t_str = tok.get('firstObservedAt') or dec.get('decidedAt') or out.get('firstObservedAt')
    raw_items.append({
        'contract': c,
        'time_str': t_str,
        'dec': dec,
        'tok': tok,
        'out': out
    })

raw_items.sort(key=lambda x: x['time_str'] if x['time_str'] else '')
tokens_441 = raw_items[:441]

print(f"Total tokens selected: {len(tokens_441)}")
print(f"Cohort 1: 163 tokens (from {tokens_441[0]['time_str']} to {tokens_441[162]['time_str']})")
print(f"Cohort 2: 278 tokens (from {tokens_441[163]['time_str']} to {tokens_441[440]['time_str']})")

# 3. Feature extraction function for a single token
def extract_token_features(item, snap_dict):
    c = item['contract']
    dec = item['dec']
    tok = item['tok']
    out = item['out']
    
    lo = out.get('lifecycleOutcome') or tok.get('lifecycleOutcome', {})
    
    # Target and Outcome
    reached138 = lo.get('reachedPlus138', False)
    max_gain = lo.get('maxGainPct', None)
    target_obs = lo.get('targetObserved', False)
    is_winner = reached138 or (max_gain is not None and max_gain >= 138) or target_obs
    
    raw_target_exec = lo.get('targetExecutable', 'UNKNOWN')
    if not raw_target_exec or raw_target_exec == '':
        raw_target_exec = 'UNKNOWN'
        
    duration = lo.get('trackedDurationSeconds', 0)
    if is_winner:
        if raw_target_exec == 'YES':
            exec_category = 'EXECUTION_PROXY'
        elif raw_target_exec == 'NO':
            exec_category = 'TARGET_OBSERVED_ONLY'
        elif raw_target_exec == 'DATA_INSUFFICIENT' or (duration is not None and duration < 120):
            exec_category = 'DATA_INSUFFICIENT'
        else:
            exec_category = 'EXECUTION_UNKNOWN'
    else:
        if raw_target_exec == 'DATA_INSUFFICIENT' or (duration is not None and duration < 60 and not out):
            exec_category = 'DATA_INSUFFICIENT'
        else:
            exec_category = 'NON_WINNER'

    # Load 0s snapshot if exists
    s0 = {}
    if snap_dict and 0 in snap_dict:
        try:
            with open(snap_dict[0]) as f:
                s0 = json.load(f)
        except:
            pass
            
    m0 = s0.get('market', {})
    f0 = s0.get('flow', {})
    
    # A) Market Cap
    mc = dec.get('observedMarketCap')
    if mc is None:
        mc = tok.get('t0MarketCap')
    if mc is None:
        mc = m0.get('marketCap')
    if mc is not None:
        try:
            mc = float(mc)
        except:
            mc = None
            
    # B) Liquidity
    liq = dec.get('observedLiquidity')
    if liq is None:
        liq = tok.get('t0Liquidity')
    if liq is None:
        liq = m0.get('liquidity')
    if liq is not None:
        try:
            liq = float(liq)
        except:
            liq = None
            
    # C) Liquidity / Market Cap
    liq_mc = None
    if liq is not None and mc is not None and mc > 0:
        liq_mc = liq / mc
    elif m0.get('liquidityMcRatio') is not None and m0.get('liquidityMcRatio') != 'DATA_UNAVAILABLE':
        try:
            liq_mc = float(m0.get('liquidityMcRatio'))
        except:
            pass

    # D) First observed price
    p0 = tok.get('t0Price')
    if p0 is None:
        p0 = m0.get('price')
    if p0 is None:
        p0 = lo.get('entryPrice')
    if p0 is not None:
        try:
            p0 = float(p0)
            if p0 <= 0:
                p0 = None
        except:
            p0 = None
            
    # Snapshots for price changes: 10s, 30s, 60s
    p10, p30, p60 = None, None, None
    peak_price = p0
    peak_sec = 0 if p0 is not None else None
    
    if snap_dict:
        # Check all snapshots to find peak price and peak time
        for sec, path in sorted(snap_dict.items()):
            try:
                with open(path) as f:
                    sd = json.load(f)
                sp = sd.get('market', {}).get('price')
                if sp is not None and sp > 0:
                    sp = float(sp)
                    if peak_price is None or sp > peak_price:
                        peak_price = sp
                        peak_sec = sec
                    if sec == 10 or (p10 is None and 8 <= sec <= 15):
                        p10 = sp
                    if sec == 30 or (p30 is None and 25 <= sec <= 35):
                        p30 = sp
                    if sec == 60 or (p60 is None and 50 <= sec <= 70):
                        p60 = sp
            except:
                pass
                
    # E) 10s price change
    p_chg_10s = None
    if p0 is not None and p10 is not None and p0 > 0:
        p_chg_10s = (p10 - p0) / p0 * 100.0
        
    # F) 30s price change
    p_chg_30s = None
    if p0 is not None and p30 is not None and p0 > 0:
        p_chg_30s = (p30 - p0) / p0 * 100.0
        
    # G) 60s price change
    p_chg_60s = None
    if p0 is not None and p60 is not None and p0 > 0:
        p_chg_60s = (p60 - p0) / p0 * 100.0
        
    # H) Initial observed volume
    vol0 = m0.get('volume')
    if vol0 is not None and vol0 != 'DATA_UNAVAILABLE':
        try:
            vol0 = float(vol0)
        except:
            vol0 = None
    else:
        vol0 = None
        
    # I) Buyer ratio
    br = f0.get('buyerRatio')
    if br is not None and br != 'DATA_UNAVAILABLE':
        try:
            br = float(br)
        except:
            br = None
    else:
        br = None
        
    # J) Buy volume
    bv = f0.get('buyVolume')
    if bv is not None and bv != 'DATA_UNAVAILABLE':
        try:
            bv = float(bv)
        except:
            bv = None
    else:
        bv = None
        
    # K) Sell volume
    sv = f0.get('sellVolume')
    if sv is not None and sv != 'DATA_UNAVAILABLE':
        try:
            sv = float(sv)
        except:
            sv = None
    else:
        sv = None
        
    # L) Net flow
    net_flow = None
    if bv is not None and sv is not None:
        net_flow = bv - sv
        
    # M) Token age at decision time
    token_age = None # Not provided in stream, NULL
    
    # N) Time from first observation to reaching +138%
    time_to_138 = None
    if is_winner:
        t_obs_str = lo.get('targetObservedTime')
        t_entry_str = lo.get('entryTime') or item['time_str']
        if t_obs_str and t_entry_str:
            try:
                t_obs = datetime.fromisoformat(t_obs_str.replace('Z', '+00:00'))
                t_ent = datetime.fromisoformat(t_entry_str.replace('Z', '+00:00'))
                diff = (t_obs - t_ent).total_seconds()
                if diff >= 0:
                    time_to_138 = diff
            except:
                pass
        # Fallback: find earliest snapshot where price >= 2.38 * p0
        if time_to_138 is None and p0 is not None and snap_dict:
            for sec, path in sorted(snap_dict.items()):
                try:
                    with open(path) as f:
                        sd = json.load(f)
                    sp = sd.get('market', {}).get('price')
                    if sp is not None and sp >= 2.38 * p0:
                        time_to_138 = float(sec)
                        break
                except:
                    pass

    # O) Time from first observation to peak
    time_to_peak = peak_sec if is_winner or (snap_dict and len(snap_dict) > 1) else None
    
    return {
        'contract': c,
        'symbol': tok.get('symbol') or dec.get('tokenSymbol') or out.get('symbol'),
        'first_observed_at': item['time_str'],
        'is_winner': is_winner,
        'exec_category': exec_category,
        'raw_target_exec': raw_target_exec,
        'max_gain_pct': max_gain,
        'max_drawdown_pct': lo.get('maxDrawdownPct'),
        'current_pnl_pct': lo.get('currentPnlPct'),
        'tracked_duration_seconds': duration,
        'market_cap': mc,
        'liquidity': liq,
        'liquidity_mc_ratio': liq_mc,
        'price_0s': p0,
        'price_change_10s': p_chg_10s,
        'price_change_30s': p_chg_30s,
        'price_change_60s': p_chg_60s,
        'volume_0s': vol0,
        'buyer_ratio': br,
        'buy_volume': bv,
        'sell_volume': sv,
        'net_flow': net_flow,
        'token_age': token_age,
        'time_to_138': time_to_138,
        'time_to_peak': time_to_peak
    }

# Test extraction
dataset = []
for it in tokens_441:
    snaps = snap_map.get(it['contract'], {})
    feat = extract_token_features(it, snaps)
    dataset.append(feat)

print(f"Extracted features for {len(dataset)} tokens.")
c1_data = dataset[:163]
c2_data = dataset[163:]

for name, sub in [("Cohort 1", c1_data), ("Cohort 2", c2_data), ("All", dataset)]:
    winners = [d for d in sub if d['is_winner']]
    print(f"\n{name}: Total={len(sub)}, Winners={len(winners)} ({len(winners)/len(sub)*100:.1f}%)")
    for feat in ['market_cap', 'liquidity', 'liquidity_mc_ratio', 'price_0s', 'price_change_10s', 'price_change_30s', 'price_change_60s', 'volume_0s', 'buyer_ratio', 'net_flow']:
        vals = [d[feat] for d in sub if d[feat] is not None]
        print(f"  {feat}: available={len(vals)}/{len(sub)} ({len(vals)/len(sub)*100:.1f}%)")
