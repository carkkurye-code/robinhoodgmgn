import os
import glob
import json

c = "0x0a3ba173174791f064915577a5b81c959ad3d3c2"

print("--- TOKEN ---")
tok_p = f"research/avci-v2/tokens/{c}.json"
if os.path.exists(tok_p):
    with open(tok_p) as f:
        print(json.dumps(json.load(f), indent=2)[:500])

print("--- OUTCOME ---")
out_p = f"research/avci-v2/outcomes/{c}.json"
if os.path.exists(out_p):
    with open(out_p) as f:
        print(json.dumps(json.load(f), indent=2)[:500])

print("--- DECISION ---")
dec_p = f"research/avci-v2/decisions/{c}.json"
if os.path.exists(dec_p):
    with open(dec_p) as f:
        print(json.dumps(json.load(f), indent=2)[:500])

print("--- SNAPSHOTS ---")
snaps = sorted(glob.glob(f"research/avci-v2/snapshots/{c}_*.json"))
print(f"Total snapshots for {c}: {len(snaps)}")
for s in snaps[:5]:
    print(os.path.basename(s))
    with open(s) as f:
        d = json.load(f)
        print(" ", d.get('elapsedSeconds'), d.get('market'), d.get('flow'))
