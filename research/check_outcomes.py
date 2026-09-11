import os
import glob
import json

outcomes_dir = 'research/avci-v2/outcomes'
tokens_dir = 'research/avci-v2/tokens'
decisions_dir = 'research/avci-v2/decisions'

dec_files = glob.glob(os.path.join(decisions_dir, '*.json'))
print(f"Decisions: {len(dec_files)}")

# Check how outcomes are stored
has_outcome_file = 0
has_token_lifecycle = 0
neither = 0

sample_winner = None
winners_count = 0

for df in dec_files:
    c = os.path.basename(df).replace('.json', '')
    out_f = os.path.join(outcomes_dir, f"{c}.json")
    tok_f = os.path.join(tokens_dir, f"{c}.json")
    
    lo = None
    if os.path.exists(out_f):
        has_outcome_file += 1
        with open(out_f) as f:
            d = json.load(f)
            lo = d.get('lifecycleOutcome', d)
    elif os.path.exists(tok_f):
        has_token_lifecycle += 1
        with open(tok_f) as f:
            d = json.load(f)
            lo = d.get('lifecycleOutcome')
    else:
        neither += 1
        
    if lo:
        r138 = lo.get('reachedPlus138')
        mg = lo.get('maxGainPct', 0)
        to = lo.get('targetObserved')
        if r138 or (mg is not None and mg >= 138) or to:
            winners_count += 1
            if not sample_winner:
                sample_winner = (c, lo)

print(f"Has outcome file: {has_outcome_file}")
print(f"Has token lifecycle: {has_token_lifecycle}")
print(f"Neither: {neither}")
print(f"Total winners count based on outcome/token: {winners_count}")
if sample_winner:
    print(f"Sample winner: {sample_winner[0]} -> {sample_winner[1]}")
