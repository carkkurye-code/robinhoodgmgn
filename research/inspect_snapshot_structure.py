import os
import glob
import json

# Let's inspect snapshots for a few tokens to see how elapsedSeconds, prices, volumes, and flows are stored
tokens_dir = 'research/avci-v2/tokens'
snapshots_dir = 'research/avci-v2/snapshots'

# Let's scan snapshots directory once
print("Scanning snapshots directory...")
snap_files = os.scandir(snapshots_dir)

token_snaps = {}
for entry in snap_files:
    if entry.name.endswith('.json'):
        parts = entry.name[:-5].split('_')
        if len(parts) == 2:
            c, s_sec = parts
            s_sec = s_sec.rstrip('s')
            try:
                sec = int(s_sec)
                if c not in token_snaps:
                    token_snaps[c] = {}
                token_snaps[c][sec] = entry.path
            except ValueError:
                pass

print(f"Tokens with snapshots: {len(token_snaps)}")

# Check available seconds across tokens
all_secs = set()
for c, s_dict in list(token_snaps.items())[:50]:
    all_secs.update(s_dict.keys())
print(f"Sample seconds present: {sorted(list(all_secs))[:15]}")

# Let's check sample flow and market fields in a 0s snapshot
sample_c = list(token_snaps.keys())[0]
print(f"Sample token {sample_c} available secs: {sorted(token_snaps[sample_c].keys())[:10]}")
if 0 in token_snaps[sample_c]:
    with open(token_snaps[sample_c][0]) as f:
        d = json.load(f)
        print("Market keys:", d.get('market', {}).keys())
        print("Flow keys:", d.get('flow', {}).keys())
        print("Market:", d.get('market'))
        print("Flow:", d.get('flow'))
