import json
import statistics
import math

with open('research/dataset_441.json') as f:
    dataset = json.load(f)

c1 = dataset[:163]
c2 = dataset[163:441]

def safe_stats(values):
    valid = [v for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]
    if not valid:
        return {
            'count': 0,
            'missing_rate': 100.0,
            'median': None,
            'mean': None,
            'min': None,
            'max': None
        }
    return {
        'count': len(valid),
        'missing_rate': (len(values) - len(valid)) / len(values) * 100.0,
        'median': statistics.median(valid),
        'mean': statistics.mean(valid),
        'min': min(valid),
        'max': max(valid)
    }

# 1. Cohort breakdown
def cohort_breakdown(sub):
    total = len(sub)
    winners = [d for d in sub if d['is_winner']]
    non_winners = [d for d in sub if not d['is_winner']]
    
    exec_proxy = [d for d in winners if d['exec_category'] == 'EXECUTION_PROXY']
    target_obs_only = [d for d in winners if d['exec_category'] == 'TARGET_OBSERVED_ONLY']
    exec_unknown = [d for d in winners if d['exec_category'] == 'EXECUTION_UNKNOWN']
    data_insufficient_winners = [d for d in winners if d['exec_category'] == 'DATA_INSUFFICIENT']
    
    all_data_insufficient = [d for d in sub if d['exec_category'] == 'DATA_INSUFFICIENT']
    
    return {
        'total': total,
        'winners': len(winners),
        'winners_pct': len(winners) / total * 100.0,
        'non_winners': len(non_winners),
        'non_winners_pct': len(non_winners) / total * 100.0,
        'exec_proxy': len(exec_proxy),
        'exec_proxy_pct_of_winners': len(exec_proxy) / len(winners) * 100.0 if winners else 0,
        'target_obs_only': len(target_obs_only),
        'target_obs_only_pct_of_winners': len(target_obs_only) / len(winners) * 100.0 if winners else 0,
        'exec_unknown': len(exec_unknown),
        'exec_unknown_pct_of_winners': len(exec_unknown) / len(winners) * 100.0 if winners else 0,
        'data_insufficient_winners': len(data_insufficient_winners),
        'all_data_insufficient': len(all_data_insufficient)
    }

cb_c1 = cohort_breakdown(c1)
cb_c2 = cohort_breakdown(c2)
cb_all = cohort_breakdown(dataset)

# 2. Feature distributions
features = [
    ('market_cap', 'Market Cap ($)'),
    ('liquidity', 'Liquidity ($)'),
    ('liquidity_mc_ratio', 'Liquidity / MC Ratio'),
    ('price_0s', 'Initial Price ($)'),
    ('price_change_10s', '10s Price Change (%)'),
    ('price_change_30s', '30s Price Change (%)'),
    ('price_change_60s', '60s Price Change (%)'),
    ('volume_0s', 'Initial Volume ($)'),
    ('buyer_ratio', 'Buyer Ratio'),
    ('buy_volume', 'Buy Volume ($)'),
    ('sell_volume', 'Sell Volume ($)'),
    ('net_flow', 'Net Flow ($)'),
    ('time_to_138', 'Time to +138% (s)'),
    ('time_to_peak', 'Time to Peak (s)')
]

feat_stats = {}
for feat_key, feat_name in features:
    feat_stats[feat_key] = {
        'name': feat_name,
        'c1_winner': safe_stats([d[feat_key] for d in c1 if d['is_winner']]),
        'c1_non_winner': safe_stats([d[feat_key] for d in c1 if not d['is_winner']]),
        'c2_winner': safe_stats([d[feat_key] for d in c2 if d['is_winner']]),
        'c2_non_winner': safe_stats([d[feat_key] for d in c2 if not d['is_winner']]),
        'all_winner': safe_stats([d[feat_key] for d in dataset if d['is_winner']]),
        'all_non_winner': safe_stats([d[feat_key] for d in dataset if not d['is_winner']]),
    }

# 3. Single feature threshold tests
def eval_rule(rule_fn, sub):
    total = len(sub)
    selected = [d for d in sub if rule_fn(d)]
    winners_in_sub = [d for d in sub if d['is_winner']]
    sel_winners = [d for d in selected if d['is_winner']]
    
    n_sel = len(selected)
    n_win = len(sel_winners)
    precision = (n_win / n_sel * 100.0) if n_sel > 0 else 0.0
    recall = (n_win / len(winners_in_sub) * 100.0) if winners_in_sub else 0.0
    baseline = len(winners_in_sub) / total * 100.0
    lift = precision / baseline if baseline > 0 else 0.0
    
    return {
        'n_selected': n_sel,
        'pct_selected': n_sel / total * 100.0,
        'n_winners': n_win,
        'win_rate': precision,
        'recall': recall,
        'lift': lift
    }

threshold_tests = [
    # Market Cap
    ('MC < $3,000', lambda d: d['market_cap'] is not None and d['market_cap'] < 3000),
    ('MC < $5,000', lambda d: d['market_cap'] is not None and d['market_cap'] < 5000),
    ('MC < $8,000', lambda d: d['market_cap'] is not None and d['market_cap'] < 8000),
    ('MC < $10,000', lambda d: d['market_cap'] is not None and d['market_cap'] < 10000),
    ('MC $5,000 - $15,000', lambda d: d['market_cap'] is not None and 5000 <= d['market_cap'] <= 15000),
    ('MC >= $10,000', lambda d: d['market_cap'] is not None and d['market_cap'] >= 10000),
    ('MC >= $20,000', lambda d: d['market_cap'] is not None and d['market_cap'] >= 20000),
    
    # Liquidity
    ('Liq < $1,000', lambda d: d['liquidity'] is not None and d['liquidity'] < 1000),
    ('Liq < $2,500', lambda d: d['liquidity'] is not None and d['liquidity'] < 2500),
    ('Liq < $5,000', lambda d: d['liquidity'] is not None and d['liquidity'] < 5000),
    ('Liq >= $2,000', lambda d: d['liquidity'] is not None and d['liquidity'] >= 2000),
    ('Liq >= $5,000', lambda d: d['liquidity'] is not None and d['liquidity'] >= 5000),
    ('Liq >= $10,000', lambda d: d['liquidity'] is not None and d['liquidity'] >= 10000),
    
    # Liquidity / MC Ratio
    ('Liq/MC < 0.2', lambda d: d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] < 0.2),
    ('Liq/MC < 0.5', lambda d: d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] < 0.5),
    ('Liq/MC >= 0.5', lambda d: d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] >= 0.5),
    ('Liq/MC >= 1.0', lambda d: d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] >= 1.0),
    ('Liq/MC >= 1.5', lambda d: d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] >= 1.5),
    
    # Price Change 10s
    ('10s Change > 0%', lambda d: d['price_change_10s'] is not None and d['price_change_10s'] > 0),
    ('10s Change > 5%', lambda d: d['price_change_10s'] is not None and d['price_change_10s'] > 5),
    ('10s Change > 15%', lambda d: d['price_change_10s'] is not None and d['price_change_10s'] > 15),
    ('10s Change <= 0%', lambda d: d['price_change_10s'] is not None and d['price_change_10s'] <= 0),
    
    # Price Change 30s
    ('30s Change > 0%', lambda d: d['price_change_30s'] is not None and d['price_change_30s'] > 0),
    ('30s Change > 10%', lambda d: d['price_change_30s'] is not None and d['price_change_30s'] > 10),
    ('30s Change > 25%', lambda d: d['price_change_30s'] is not None and d['price_change_30s'] > 25),
    
    # Price Change 60s
    ('60s Change > 0%', lambda d: d['price_change_60s'] is not None and d['price_change_60s'] > 0),
    ('60s Change > 15%', lambda d: d['price_change_60s'] is not None and d['price_change_60s'] > 15),
    
    # Initial Volume
    ('Volume > $0', lambda d: d['volume_0s'] is not None and d['volume_0s'] > 0),
    ('Volume > $1,000', lambda d: d['volume_0s'] is not None and d['volume_0s'] > 1000),
    ('Volume > $5,000', lambda d: d['volume_0s'] is not None and d['volume_0s'] > 5000),
    ('Volume > $10,000', lambda d: d['volume_0s'] is not None and d['volume_0s'] > 10000),
]

single_test_results = []
for label, fn in threshold_tests:
    res_c1 = eval_rule(fn, c1)
    res_c2 = eval_rule(fn, c2)
    res_all = eval_rule(fn, dataset)
    single_test_results.append({
        'label': label,
        'c1': res_c1,
        'c2': res_c2,
        'all': res_all
    })

# 4. Combination tests
combo_tests = [
    ('Combo 1: MC < $8k & Liq >= $1k',
     lambda d: d['market_cap'] is not None and d['market_cap'] < 8000 and d['liquidity'] is not None and d['liquidity'] >= 1000),
     
    ('Combo 2: MC < $8k & Liq/MC >= 0.5',
     lambda d: d['market_cap'] is not None and d['market_cap'] < 8000 and d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] >= 0.5),
     
    ('Combo 3: MC < $10k & 10s Change > 0%',
     lambda d: d['market_cap'] is not None and d['market_cap'] < 10000 and d['price_change_10s'] is not None and d['price_change_10s'] > 0),
     
    ('Combo 4: MC $3k-$10k & Liq $1k-$5k',
     lambda d: d['market_cap'] is not None and 3000 <= d['market_cap'] <= 10000 and d['liquidity'] is not None and 1000 <= d['liquidity'] <= 5000),
     
    ('Combo 5: MC < $10k & Volume > $1k',
     lambda d: d['market_cap'] is not None and d['market_cap'] < 10000 and d['volume_0s'] is not None and d['volume_0s'] > 1000),
     
    ('Combo 6: 10s Change > 5% & 30s Change > 10%',
     lambda d: d['price_change_10s'] is not None and d['price_change_10s'] > 5 and d['price_change_30s'] is not None and d['price_change_30s'] > 10),
     
    ('Combo 7: Liq/MC >= 1.0 & Liq >= $2k',
     lambda d: d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] >= 1.0 and d['liquidity'] is not None and d['liquidity'] >= 2000),
     
    ('Combo 8: MC < $5k & Liq >= $2k & Liq/MC >= 0.5',
     lambda d: d['market_cap'] is not None and d['market_cap'] < 5000 and d['liquidity'] is not None and d['liquidity'] >= 2000 and d['liquidity_mc_ratio'] is not None and d['liquidity_mc_ratio'] >= 0.5),

    ('Combo 9: MC < $6k & Volume > $500 & 10s Change >= 0%',
     lambda d: d['market_cap'] is not None and d['market_cap'] < 6000 and d['volume_0s'] is not None and d['volume_0s'] > 500 and d['price_change_10s'] is not None and d['price_change_10s'] >= 0)
]

combo_results = []
for label, fn in combo_tests:
    res_c1 = eval_rule(fn, c1)
    res_c2 = eval_rule(fn, c2)
    res_all = eval_rule(fn, dataset)
    combo_results.append({
        'label': label,
        'c1': res_c1,
        'c2': res_c2,
        'all': res_all
    })

# 5. $1 -> $2.38 Simulation Engine
def run_simulation(sub, filter_fn=None, sl_pct=-30, execution_reality='OBSERVED'):
    """
    sl_pct: -30, -50, -80, -100
    execution_reality: 'OBSERVED' vs 'EXECUTION_PROXY'
    """
    trades = [d for d in sub if filter_fn is None or filter_fn(d)]
    n_trades = len(trades)
    if n_trades == 0:
        return {
            'n_trades': 0,
            'pnl': 0.0,
            'win_rate': 0.0,
            'profit_factor': 0.0,
            'max_drawdown': 0.0,
            'avg_trade_pnl': 0.0
        }
        
    pnl_list = []
    wins = 0
    gross_profits = 0.0
    gross_losses = 0.0
    
    for t in trades:
        is_win = t['is_winner']
        exec_cat = t['exec_category']
        
        if execution_reality == 'OBSERVED':
            if is_win:
                pnl = 1.38 # +138% net gain on $1
                wins += 1
                gross_profits += pnl
            else:
                pnl = sl_pct / 100.0 # e.g. -0.30
                gross_losses += abs(pnl)
        else: # EXECUTION_PROXY REALITY
            # Only EXECUTION_PROXY (targetExecutable == 'YES') fills at target.
            # Slippage haircut: 10% (5% buy impact + 5% sell impact) -> net target gain = 138% * 0.90 = 124.2% -> +$1.14 net
            if is_win and exec_cat == 'EXECUTION_PROXY':
                pnl = 1.142
                wins += 1
                gross_profits += pnl
            else:
                # If TARGET_OBSERVED_ONLY or UNKNOWN or DATA_INSUFFICIENT or NON_WINNER:
                # Token could not execute +138% fill in orderbook, suffers drawdown / hits SL
                # With slippage on exit (-10% slippage on top of stop-loss)
                pnl = min(-1.0, (sl_pct - 10.0) / 100.0)
                gross_losses += abs(pnl)
                
        pnl_list.append(pnl)
        
    cum_pnl = 0.0
    peak_pnl = 0.0
    max_dd = 0.0
    for p in pnl_list:
        cum_pnl += p
        if cum_pnl > peak_pnl:
            peak_pnl = cum_pnl
        dd = peak_pnl - cum_pnl
        if dd > max_dd:
            max_dd = dd
            
    pf = (gross_profits / gross_losses) if gross_losses > 0 else (999.0 if gross_profits > 0 else 0.0)
    
    return {
        'n_trades': n_trades,
        'pnl': cum_pnl,
        'win_rate': (wins / n_trades * 100.0) if n_trades > 0 else 0.0,
        'profit_factor': pf,
        'max_drawdown': max_dd,
        'avg_trade_pnl': cum_pnl / n_trades if n_trades > 0 else 0.0
    }

# Run simulations across configurations
sim_results = {}
for sl in [-30, -50, -80, -100]:
    sim_results[f"SL_{abs(sl)}"] = {
        'c1_all_obs': run_simulation(c1, sl_pct=sl, execution_reality='OBSERVED'),
        'c1_all_exec': run_simulation(c1, sl_pct=sl, execution_reality='EXECUTION_PROXY'),
        'c2_all_obs': run_simulation(c2, sl_pct=sl, execution_reality='OBSERVED'),
        'c2_all_exec': run_simulation(c2, sl_pct=sl, execution_reality='EXECUTION_PROXY'),
        'comb_all_obs': run_simulation(dataset, sl_pct=sl, execution_reality='OBSERVED'),
        'comb_all_exec': run_simulation(dataset, sl_pct=sl, execution_reality='EXECUTION_PROXY'),
        
        # Best C1 filter: Combo 1 (MC < $8k & Liq >= $1k)
        'c1_combo1_obs': run_simulation(c1, filter_fn=combo_tests[0][1], sl_pct=sl, execution_reality='OBSERVED'),
        'c1_combo1_exec': run_simulation(c1, filter_fn=combo_tests[0][1], sl_pct=sl, execution_reality='EXECUTION_PROXY'),
        'c2_combo1_obs': run_simulation(c2, filter_fn=combo_tests[0][1], sl_pct=sl, execution_reality='OBSERVED'),
        'c2_combo1_exec': run_simulation(c2, filter_fn=combo_tests[0][1], sl_pct=sl, execution_reality='EXECUTION_PROXY'),
        'comb_combo1_obs': run_simulation(dataset, filter_fn=combo_tests[0][1], sl_pct=sl, execution_reality='OBSERVED'),
        'comb_combo1_exec': run_simulation(dataset, filter_fn=combo_tests[0][1], sl_pct=sl, execution_reality='EXECUTION_PROXY'),

        # Combo 3: MC < $10k & 10s Change > 0%
        'c1_combo3_obs': run_simulation(c1, filter_fn=combo_tests[2][1], sl_pct=sl, execution_reality='OBSERVED'),
        'c1_combo3_exec': run_simulation(c1, filter_fn=combo_tests[2][1], sl_pct=sl, execution_reality='EXECUTION_PROXY'),
        'c2_combo3_obs': run_simulation(c2, filter_fn=combo_tests[2][1], sl_pct=sl, execution_reality='OBSERVED'),
        'c2_combo3_exec': run_simulation(c2, filter_fn=combo_tests[2][1], sl_pct=sl, execution_reality='EXECUTION_PROXY'),
    }

# Save computed results
full_report_data = {
    'breakdowns': {
        'cohort_1': cb_c1,
        'cohort_2': cb_c2,
        'combined': cb_all
    },
    'feature_stats': feat_stats,
    'single_tests': single_test_results,
    'combo_tests': combo_results,
    'simulations': sim_results
}

with open('research/analysis_results.json', 'w') as f:
    json.dump(full_report_data, f, indent=2)

print("Analysis results successfully calculated and saved to research/analysis_results.json")
