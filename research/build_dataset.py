import os
import json
import glob
from datetime import datetime
import statistics
import math

# Load pre-extracted or extract fresh
tokens_dir = 'research/avci-v2/tokens'
snapshots_dir = 'research/avci-v2/snapshots'
decisions_dir = 'research/avci-v2/decisions'
outcomes_dir = 'research/avci-v2/outcomes'

# 1. Index snapshots
print("Indexing snapshots...")
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

# 2. Collect 441 tokens
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

# 3. Extract features
def extract_token(item, snap_dict):
    c = item['contract']
    dec = item['dec']
    tok = item['tok']
    out = item['out']
    lo = out.get('lifecycleOutcome') or tok.get('lifecycleOutcome', {})
    
    reached138 = lo.get('reachedPlus138', False)
    max_gain = lo.get('maxGainPct', None)
    target_obs = lo.get('targetObserved', False)
    is_winner = reached138 or (max_gain is not None and max_gain >= 138) or target_obs
    
    raw_target_exec = lo.get('targetExecutable', 'UNKNOWN')
    if not raw_target_exec:
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

    s0 = {}
    if snap_dict and 0 in snap_dict:
        try:
            with open(snap_dict[0]) as f:
                s0 = json.load(f)
        except:
            pass
            
    m0 = s0.get('market', {})
    f0 = s0.get('flow', {})
    
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
            
    liq_mc = None
    if liq is not None and mc is not None and mc > 0:
        liq_mc = liq / mc
    elif m0.get('liquidityMcRatio') is not None and m0.get('liquidityMcRatio') != 'DATA_UNAVAILABLE':
        try:
            liq_mc = float(m0.get('liquidityMcRatio'))
        except:
            pass

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
            
    p10, p30, p60 = None, None, None
    peak_price = p0
    peak_sec = 0 if p0 is not None else None
    
    if snap_dict:
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
                
    p_chg_10s = (p10 - p0) / p0 * 100.0 if (p0 and p10 and p0 > 0) else None
    p_chg_30s = (p30 - p0) / p0 * 100.0 if (p0 and p30 and p0 > 0) else None
    p_chg_60s = (p60 - p0) / p0 * 100.0 if (p0 and p60 and p0 > 0) else None
    
    vol0 = m0.get('volume')
    if vol0 is not None and vol0 != 'DATA_UNAVAILABLE':
        try:
            vol0 = float(vol0)
        except:
            vol0 = None
    else:
        vol0 = None
        
    br = f0.get('buyerRatio')
    if br is not None and br != 'DATA_UNAVAILABLE':
        try:
            br = float(br)
        except:
            br = None
    else:
        br = None
        
    bv = f0.get('buyVolume')
    if bv is not None and bv != 'DATA_UNAVAILABLE':
        try:
            bv = float(bv)
        except:
            bv = None
    else:
        bv = None
        
    sv = f0.get('sellVolume')
    if sv is not None and sv != 'DATA_UNAVAILABLE':
        try:
            sv = float(sv)
        except:
            sv = None
    else:
        sv = None
        
    net_flow = bv - sv if (bv is not None and sv is not None) else None
    token_age = None
    
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

    time_to_peak = peak_sec if is_winner or (snap_dict and len(snap_dict) > 1) else None
    
    return {
        'contract': c,
        'symbol': tok.get('symbol') or dec.get('tokenSymbol') or out.get('symbol'),
        'first_observed_at': item['time_str'],
        'is_winner': is_winner,
        'exec_category': exec_category,
        'raw_target_exec': raw_target_exec,
        'max_gain_pct': max_gain if max_gain is not None else 0,
        'max_drawdown_pct': lo.get('maxDrawdownPct', 0),
        'current_pnl_pct': lo.get('currentPnlPct', 0),
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

print("Extracting all 441 tokens...")
dataset = []
for it in tokens_441:
    snaps = snap_map.get(it['contract'], {})
    dataset.append(extract_token(it, snaps))

c1 = dataset[:163]
c2 = dataset[163:441]

# Save dataset json
with open('research/dataset_441.json', 'w') as f:
    json.dump(dataset, f, indent=2)

print("Dataset saved to research/dataset_441.json")
