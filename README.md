# Startup & SME Valuator

Three valuation calculators in one page, priced with 2026 market data:

| Valuator | For | Methods |
|---|---|---|
| **Startup model** | Startups from pre-seed to Series C, AI or not | Ten methods (scorecard, Berkus, risk factor summation, development stage, cost to duplicate, comparables with AI comps by segment, VC method, First Chicago, risk-adjusted DCF, last round stepped up) plus success odds: next round, acquisition, IPO, shutdown |
| **Tech startup** | SaaS, AI, marketplace, app and other tech companies with revenue, for a sale or a funding round | Adjusted revenue multiple from 2026 private SaaS deals, owner-earnings multiple for small software businesses, venture capital method |
| **Small & medium business** | Shops, trades, restaurants, services, manufacturers being sold, in the US, the UK or France | Industry SDE or EBITDA multiple with seven value drivers, local adviser ranges for UK and French businesses, capitalised earnings, revenue multiple, asset floor, bank-financing check |

Each valuator shows a blended estimate, a likely range, a football-field chart of every method, the working behind each method, and warnings (for example, when a price is above what a bank will lend a buyer). **Copy summary** puts the result, key inputs and method breakdown on the clipboard as plain text, ready to paste into an email to a buyer, broker or adviser.

The data and every source are in [RESEARCH.md](RESEARCH.md) and on the app's **Market data** tab.

### Startup success odds

The startup model estimates the chance of raising the next round (within 24 months and eventually), and where the company will be by its exit year: IPO, acquired, still private or shut down. Long-run outcomes come from a multinomial logistic regression fitted on **6,153 Y Combinator startups** (batches 2005–2026, snapshot 24 Oct 2026; hold-out AUC 0.75–0.84). Next-round odds start from 2025–26 Carta and PitchBook graduation rates. Both are adjusted for investors, founder track record, traction, runway and stage, and the results feed the First Chicago and DCF methods. Methods, coefficients and caveats: RESEARCH.md, sections 7–9.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```sh
npm start            # python3 -m http.server 8080, then open http://localhost:8080
```

Figures typed into the forms are saved in the browser only (localStorage).

## Single-file version

```sh
npm run build        # writes dist/startup-sme-valuator.html with CSS and JS inlined
```

That one file can be emailed or hosted anywhere.

## Tests

```sh
npm test             # node --test, Node 18+
```

The tests check the maths of each method and that the calibration still lands on the published medians (for example, a median SaaS company prices at SEG's 4.0x, and a typical service business near BizBuySell's 2.58x SDE).

## Project layout

```
index.html              page shell and tabs
src/benchmarks.js       all market data, with a source key on every figure
src/valuation.js        valuation engine for the SME and tech valuators (pure functions; browser and Node)
src/startup-data.js     startup model data: fitted outcome model, funnel rates, drivers, AI comps
src/startup-model.js    startup model engine: ten methods and success probabilities
src/app.js              forms, live recalculation, sheet and chart rendering, market-data tab
src/styles.css          styles (light and dark)
scripts/build.mjs       bundles everything into one HTML file
scripts/fit_outcome_model.py  refits the startup outcome model on the YC directory
test/                   unit tests
RESEARCH.md             the research: figures, sources, caveats, assumptions
```

## Updating the data

All benchmarks live in `src/benchmarks.js` (SMEs, tech) and `src/startup-data.js` (startup model). When BizBuySell, SEG, Carta or Pepperdine publish new numbers, update the figure and its source there, then run `npm test`. A failing calibration test tells you the curves need refitting.

To refit the startup outcome model on a fresh YC snapshot (needs numpy and pandas):

```sh
git clone --depth 1 https://github.com/yc-oss/api /tmp/yc-api
python3 scripts/fit_outcome_model.py /tmp/yc-api/companies/all.json outcome_model.json
```

Then copy the coefficients, hold-out scores and calibration table into `OUTCOME_MODEL` in `src/startup-data.js` (set `AS_OF` in the script to the snapshot date first).

## Limits

- Benchmarks are mostly US deal data. For UK and French businesses the SME valuator adds local ranges on adjusted EBITDA (adviser guidance, not deal data). Startup baselines are offered for the US, Europe and the UK; elsewhere, type your own.
- Several 2026 figures come from broker and advisor summaries of paywalled reports. RESEARCH.md marks which.
- This is a planning tool, not a formal appraisal. Have a qualified valuer or broker review any figure before relying on it.
