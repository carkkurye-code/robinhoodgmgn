import os
import glob
import json
from collections import Counter

outcomes_dir = 'research/avci-v2/outcomes'
tokens_dir = 'research/avci-v2/tokens'
decisions_dir = 'research/avci-v2/decisions'

# Sort the 441 decisions by decidedAt/time
dec_files = glob.glob(os.path.join(decisions_dir, '*.json'))
items = []
for f in dec_files:
    c = os.path.basename(f).replace('.json', '')
    with open(f) as dec_f:
        dec = json.load(dec_f)
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
    t_str = tok.get('firstObservedAt') or dec.get('decidedAt') or out.get('firstObservedAt')
    items.append({
        'contract': c,
        'time_str': t_str,
        'dec': dec,
        'tok': tok,
        'out': out
    })

items.sort(key=lambda x: x['time_str'] if x['time_str'] else '')

# Take exactly the first 441 tokens
tokens_441 = items[:441]
cohort1 = tokens_441[:163]
cohort2 = tokens_441[163:441]

print(f"Total analyzed: {len(tokens_441)} (Cohort 1: {len(cohort1)}, Cohort 2: {len(cohort2)})")

def inspect_cohort(name, cohort):
    print(f"\n=== {name} ===")
    winner_count = 0
    non_winner_count = 0
    exec_status_counts = Counter()
    reached138_counts = Counter()
    
    for item in cohort:
        tok = item['tok']
        out = item['out']
        lo = out.get('lifecycleOutcome') or tok.get('lifecycleOutcome', {})
        
        reached138 = lo.get('reachedPlus138', False)
        max_gain = lo.get('maxGainPct', 0)
        target_obs = lo.get('targetObserved', False)
        
        # WINNER_138 definition: +138% or higher price movement observed
        is_winner = reached138 or (max_gain is not None and max_gain >= 138) or target_obs
        
        target_exec = lo.get('targetExecutable', 'DATA_INSUFFICIENT')
        if not target_exec:
            target_exec = 'UNKNOWN'
            
        exec_status_counts[target_exec] += 1
        
        if is_winner:
            winner_count += 1
        else:
            non_winner_count += 1
            
    print(f"WINNER_138: {winner_count} ({winner_count/len(cohort)*100:.1f}%)")
    print(f"NON_WINNER_138: {non_winner_count} ({non_winner_count/len(cohort)*100:.1f}%)")
    print(f"Target Executable breakdown: {dict(exec_status_counts)}")

inspect_cohort("Cohort #1 (First 163)", cohort1)
inspect_cohort("Cohort #2 (Next 278)", cohort2)
inspect_cohort("Combined (Total 441)", tokens_441)
