import os
import json
import glob
from datetime import datetime

decisions_dir = 'research/avci-v2/decisions'
tokens_dir = 'research/avci-v2/tokens'
outcomes_dir = 'research/avci-v2/outcomes'

dec_files = glob.glob(os.path.join(decisions_dir, '*.json'))
print(f"Total decision files: {len(dec_files)}")

items = []
for f in dec_files:
    c = os.path.basename(f).replace('.json', '')
    with open(f) as dec_f:
        dec = json.load(dec_f)
    
    # Check token file
    tok_f = os.path.join(tokens_dir, f"{c}.json")
    tok = {}
    if os.path.exists(tok_f):
        with open(tok_f) as tf:
            tok = json.load(tf)
            
    out_f = os.path.join(outcomes_dir, f"{c}.json")
    out = {}
    if os.path.exists(out_f):
        with open(out_f) as of:
            out = json.load(of)

    # determine time
    # priority: tok.firstObservedAt, dec.decidedAt, out.firstObservedAt
    t_str = tok.get('firstObservedAt') or dec.get('decidedAt') or out.get('firstObservedAt')
    data_source = tok.get('dataSource') or dec.get('dataSource') or 'LIVE_DISCOVERY'
    
    items.append({
        'contract': c,
        'time_str': t_str,
        'symbol': tok.get('symbol') or dec.get('tokenSymbol') or out.get('symbol'),
        'data_source': data_source,
        'has_outcome': bool(out),
        'has_token': bool(tok),
        'has_decision': bool(dec)
    })

# Sort items by time
items.sort(key=lambda x: x['time_str'] if x['time_str'] else '')

print(f"Total items: {len(items)}")
print(f"Earliest: {items[0]['time_str']} ({items[0]['symbol']})")
print(f"163rd (Cohort 1 end): {items[162]['time_str']} ({items[162]['symbol']})")
print(f"164th (Cohort 2 start): {items[163]['time_str']} ({items[163]['symbol']})")
print(f"Latest (Cohort 2 end): {items[-1]['time_str']} ({items[-1]['symbol']})")

non_live = [it for it in items if it['data_source'] != 'LIVE_DISCOVERY']
print(f"Non-LIVE_DISCOVERY items: {len(non_live)}")
