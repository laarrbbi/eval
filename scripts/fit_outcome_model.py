"""
Fit the startup outcome model used by src/startup-data.js (OUTCOME_MODEL).

Data: the Y Combinator company directory published by https://github.com/yc-oss/api
(companies/all.json). Outcome = status (Active, Acquired, Public, Inactive).
Model: multinomial logistic regression (reference = Active) with a small ridge penalty,
fitted by Newton's method; 80/20 hold-out for AUC and log-loss; calibration by age band.

Usage:
  git clone --depth 1 https://github.com/yc-oss/api /tmp/yc-api
  python3 scripts/fit_outcome_model.py /tmp/yc-api/companies/all.json outcome_model.json

Requires numpy and pandas. Update AS_OF to the snapshot date before refitting.
"""
import json, math, re, sys
import numpy as np
import pandas as pd

AS_OF = pd.Timestamp('2026-10-24')
SEASON_MONTH = {'Winter': 1, 'Spring': 4, 'Summer': 6, 'Fall': 9}
AI_TAGS = {'AI', 'Generative AI', 'Machine Learning', 'AI Assistant', 'Artificial Intelligence', 'Deep Learning',
           'Computer Vision', 'NLP', 'Conversational AI', 'AIOps', 'AI-Enhanced Learning', 'LLM'}

def load(path):
    rows = []
    for d in json.load(open(path)):
        m = re.match(r'(Winter|Spring|Summer|Fall) (\d{4})$', d.get('batch') or '')
        if not m or d.get('status') not in ('Active', 'Inactive', 'Acquired', 'Public'):
            continue
        start = pd.Timestamp(year=int(m.group(2)), month=SEASON_MONTH[m.group(1)], day=1)
        age = (AS_OF - start).days / 365.25
        if age < 0.25:
            continue
        tags = set(d.get('tags') or [])
        regions = set(d.get('regions') or [])
        rows.append({
            'name': d.get('name'), 'batch': d['batch'], 'year': int(m.group(2)), 'age': age,
            'status': d['status'], 'industry': d.get('industry') or 'Unspecified',
            'ai': int(bool(tags & AI_TAGS)),
            'genai': int(bool(tags & {'Generative AI', 'LLM', 'AI Assistant'})),
            'saas': int('SaaS' in tags), 'devtools': int('Developer Tools' in tags),
            'hardware': int(bool(tags & {'Hardware', 'Hard Tech', 'Robotics'})),
            'biotech': int(bool(tags & {'Biotech', 'Therapeutics', 'Drug Discovery'})),
            'marketplace': int('Marketplace' in tags), 'crypto': int('Crypto / Web3' in tags),
            'us': int('United States of America' in regions or 'America / Canada' in regions and 'Canada' not in regions),
            'top': int(bool(d.get('top_company'))), 'team': d.get('team_size'),
            'nonprofit': int(bool(d.get('nonprofit'))),
        })
    return pd.DataFrame(rows)



df = load(sys.argv[1])
CLASSES = ['Acquired', 'Public', 'Inactive']  # reference: Active
OTHER_IND = {'Education', 'Government', 'Real Estate and Construction', 'Unspecified'}

LN_AGE_MEAN = float(np.log(df.age).mean())

def features(d):
    la = np.log(d.age) - LN_AGE_MEAN
    X = pd.DataFrame({
        'const': 1.0,
        'ln_age': la,
        'ln_age2': la ** 2,
        'ai': d.ai,
        'consumer': (d.industry == 'Consumer').astype(float),
        'healthcare': (d.industry == 'Healthcare').astype(float),
        'fintech': (d.industry == 'Fintech').astype(float),
        'industrials': (d.industry == 'Industrials').astype(float),
        'other_industry': d.industry.isin(OTHER_IND).astype(float),
        'us': d.us,
        'hardware': d.hardware,
        'biotech': d.biotech,
        'saas': d.saas,
    })
    return X

def fit(X, y, lam=1.0, iters=60):
    n, p = X.shape
    K = len(CLASSES)
    Y = np.zeros((n, K))
    for k, c in enumerate(CLASSES):
        Y[:, k] = (y == c)
    W = np.zeros((p, K))
    pen = np.full(p, lam); pen[0] = 0.0  # no penalty on intercepts
    P = np.diag(np.tile(pen, K))
    for _ in range(iters):
        eta = X @ W
        m = eta.max(axis=1, keepdims=True).clip(min=0)
        ex = np.exp(eta - m)
        denom = np.exp(-m) + ex.sum(axis=1, keepdims=True)
        Pk = ex / denom
        G = (X.T @ (Y - Pk)).reshape(-1, order='F') - P @ W.reshape(-1, order='F')
        H = np.zeros((p * K, p * K))
        for a in range(K):
            for b in range(K):
                w = Pk[:, a] * ((a == b) - Pk[:, b])
                H[a*p:(a+1)*p, b*p:(b+1)*p] = -(X * w[:, None]).T @ X
        H -= P
        step = np.linalg.solve(H, G)
        W = W - step.reshape((p, K), order='F')
        if np.abs(step).max() < 1e-9:
            break
    cov = np.linalg.inv(-H)
    se = np.sqrt(np.diag(cov)).reshape((p, K), order='F')
    return W, se

def predict(X, W):
    eta = X @ W
    ex = np.exp(eta)
    denom = 1 + ex.sum(axis=1, keepdims=True)
    return np.column_stack([1 / denom[:, 0], ex / denom])  # Active, Acquired, Public, Inactive

def auc(score, label):
    order = np.argsort(score)
    ranks = np.empty(len(score)); ranks[order] = np.arange(1, len(score) + 1)
    pos = label.sum(); neg = len(label) - pos
    return float((ranks[label == 1].sum() - pos * (pos + 1) / 2) / (pos * neg)) if pos and neg else None

rng = np.random.default_rng(7)
test_mask = rng.random(len(df)) < 0.2
X = features(df).values.astype(float)
y = df.status.values
cols = list(features(df).columns)

# Out-of-sample check
Wtr, _ = fit(X[~test_mask], y[~test_mask])
Pte = predict(X[test_mask], Wtr)
yte = y[test_mask]
names = ['Active'] + CLASSES
ll = np.mean(np.log(np.clip(Pte[np.arange(len(yte)), [names.index(v) for v in yte]], 1e-12, 1)))
base = df[~test_mask].status.value_counts(normalize=True)
ll0 = np.mean(np.log([base[v] for v in yte]))
holdout = {
    'n_test': int(test_mask.sum()),
    'log_loss': -ll, 'log_loss_baseline': -ll0,
    'mcfadden_r2': 1 - ll / ll0,
    'auc': {c: auc(Pte[:, names.index(c)], (yte == c).astype(int)) for c in names},
}

# Final fit on all data
W, se = fit(X, y)
P = predict(X, W)
df_pred = pd.DataFrame(P, columns=names)
df_pred['band'] = pd.cut(df.age.values, [0, 2, 5, 10, 22], right=False)
df_pred['status'] = y
calib = []
for band, g in df_pred.groupby('band', observed=True):
    calib.append({'age_band': str(band), 'n': int(len(g)),
                  **{f'pred_{c}': round(float(g[c].mean()), 3) for c in names},
                  **{f'obs_{c}': round(float((g.status == c).mean()), 3) for c in names}})

def pval(z):
    return math.erfc(abs(z) / math.sqrt(2))

coef_table = []
for i, f in enumerate(cols):
    row = {'feature': f}
    for k, c in enumerate(CLASSES):
        b, s = W[i, k], se[i, k]
        row[c] = {'b': round(float(b), 4), 'se': round(float(s), 4), 'or': round(math.exp(b), 3), 'p': round(pval(b / s), 4)}
    coef_table.append(row)

summary = {
    'source': 'yc-oss/api companies/all.json (Y Combinator directory), snapshot 2026-10-24',
    'n': int(len(df)),
    'status_counts': {k: int(v) for k, v in df.status.value_counts().items()},
    'batches': f"{df.year.min()}-{df.year.max()}",
    'ln_age_mean': LN_AGE_MEAN,
    'features': cols,
    'classes': CLASSES,
    'coef': {c: [round(float(W[i, k]), 5) for i in range(len(cols))] for k, c in enumerate(CLASSES)},
    'coef_table': coef_table,
    'holdout': holdout,
    'calibration': calib,
    'ridge_lambda': 1.0,
}
json.dump(summary, open(sys.argv[2] if len(sys.argv) > 2 else 'outcome_model.json', 'w'), indent=1)

print('n', summary['n'], summary['status_counts'])
print('holdout', json.dumps(holdout, indent=1))
print('\ncoefficients (odds ratio, p-value)')
for row in coef_table:
    print(f"{row['feature']:15s}", '  '.join(f"{c[:4]} OR={row[c]['or']:<7} p={row[c]['p']:<7}" for c in CLASSES))
print('\ncalibration')
for c in calib: print(c)
