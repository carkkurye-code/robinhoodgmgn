import os
import glob
import json

tokens_dir = 'research/avci-v2/tokens'
snapshots_dir = 'research/avci-v2/snapshots'
decisions_dir = 'research/avci-v2/decisions'
outcomes_dir = 'research/avci-v2/outcomes'

def get_contracts(path):
    files = glob.glob(os.path.join(path, '*.json'))
    contracts = set()
    for f in files:
        base = os.path.basename(f)
        contract = base.split('.')[0].split('_')[0]
        contracts.add(contract)
    return contracts

c_tokens = get_contracts(tokens_dir)
c_decisions = get_contracts(decisions_dir)
c_outcomes = get_contracts(outcomes_dir)
c_snapshots = get_contracts(snapshots_dir)

all_contracts = c_tokens | c_decisions | c_outcomes | c_snapshots
print(f"Contracts in tokens: {len(c_tokens)}")
print(f"Contracts in decisions: {len(c_decisions)}")
print(f"Contracts in outcomes: {len(c_outcomes)}")
print(f"Contracts in snapshots: {len(c_snapshots)}")
print(f"Total unique contracts across all: {len(all_contracts)}")

# Also check timestamps of tokens / decisions to see chronological ordering
records = []
for c in all_contracts:
    # try loading decision first, then token
    dec_file = os.path.join(decisions_dir, f"{c}.json")
    tok_file = os.path.join(tokens_dir, f"{c}.json")
    
    t0_time = None
    data_source = None
    
    if os.path.exists(dec_file):
        try:
            with open(dec_file) as f:
                d = json.load(f)
                t0_time = d.get('evaluatedAt') or d.get('firstObservedAt') or d.get('timestamp')
                data_source = d.get('dataSource')
        except:
            pass
            
    if not t0_time and os.path.exists(tok_file):
        try:
            with open(tok_file) as f:
                d = json.load(f)
                t0_time = d.get('firstObservedAt') or d.get('entryTime')
                data_source = data_source or d.get('dataSource')
        except:
            pass
            
    if not t0_time:
        # Check snapshot 0s
        snap0 = os.path.join(snapshots_dir, f"{c}_0s.json")
        if os.path.exists(snap0):
            try:
                with open(snap0) as f:
                    d = json.load(f)
                    t0_time = d.get('observedAt')
                    data_source = data_source or d.get('dataSource')
            except:
                pass
                
    records.append({
        'contract': c,
        't0_time': t0_time,
        'has_decision': os.path.exists(dec_file),
        'has_token': os.path.exists(tok_file),
        'data_source': data_source
    })

print(f"Records count: {len(records)}")
with_time = [r for r in records if r['t0_time']]
print(f"With t0_time: {len(with_time)}")
without_time = [r for r in records if not r['t0_time']]
print(f"Without t0_time: {len(without_time)}")
if without_time:
    print("Without time examples:", without_time[:5])
