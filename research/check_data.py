import os
import glob
import json
from datetime import datetime

tokens_dir = 'research/avci-v2/tokens'
snapshots_dir = 'research/avci-v2/snapshots'
decisions_dir = 'research/avci-v2/decisions'
outcomes_dir = 'research/avci-v2/outcomes'

# Collect all token contracts
token_files = glob.glob(os.path.join(tokens_dir, '*.json'))
decision_files = glob.glob(os.path.join(decisions_dir, '*.json'))
outcome_files = glob.glob(os.path.join(outcomes_dir, '*.json'))

print(f"Token files: {len(token_files)}")
print(f"Decision files: {len(decision_files)}")
print(f"Outcome files: {len(outcome_files)}")

# Check summary.json
with open('research/avci-v2/summary.json') as f:
    summary = json.load(f)

print(f"Summary total tokens: {summary.get('totalTokensTracked')}")
print(f"Summary earlyDiscoveryTokens: {len(summary.get('earlyDiscoveryTokens', []))}")
