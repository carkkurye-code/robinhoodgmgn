import os
import glob
import json

tokens_dir = 'research/avci-v2/tokens'
sample_files = glob.glob(os.path.join(tokens_dir, '*.json'))[:20]

all_keys = set()
for sf in sample_files:
    with open(sf) as f:
        d = json.load(f)
        all_keys.update(d.keys())

print("Token root keys:", sorted(list(all_keys)))

with open(sample_files[0]) as f:
    print("Full token 0 dump:")
    print(json.dumps(json.load(f), indent=2))
