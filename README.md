# Startup & SME Valuator

Three valuation calculators in one page, priced with 2026 market data:

| Valuator | For | Methods |
|---|---|---|
| **Early-stage startup** | Pre-revenue companies raising money | Scorecard, Berkus, risk factor summation, venture capital method |
| **Tech startup** | SaaS, AI, marketplace, app and other tech companies with revenue, for a sale or a funding round | Adjusted revenue multiple from 2026 private SaaS deals, owner-earnings multiple for small software businesses, venture capital method |
| **Small & medium business** | Shops, trades, restaurants, services, manufacturers being sold | Industry SDE or EBITDA multiple with seven value drivers, capitalised earnings, revenue multiple, asset floor, bank-financing check |

Each valuator shows a blended estimate, a likely range, a football-field chart of every method, the working behind each method, and warnings (for example, when a price is above what a bank will lend a buyer).

The data and every source are in [RESEARCH.md](RESEARCH.md) and on the app's **Market data** tab.

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
src/valuation.js        valuation engine (pure functions; runs in the browser and in Node)
src/app.js              forms, live recalculation, sheet and chart rendering, market-data tab
src/styles.css          styles (light and dark)
scripts/build.mjs       bundles everything into one HTML file
test/valuation.test.js  unit tests
RESEARCH.md             the research: figures, sources, caveats, assumptions
```

## Updating the data

All benchmarks live in `src/benchmarks.js`. When BizBuySell, SEG, Carta or Pepperdine publish new numbers, update the figure and its source there, then run `npm test`. A failing calibration test tells you the curves need refitting.

## Limits

- Benchmarks are mostly US data. Multiples are unitless and travel reasonably well; absolute startup baselines do not, so pick the right market or type your own baseline.
- Several 2026 figures come from broker and advisor summaries of paywalled reports. RESEARCH.md marks which.
- This is a planning tool, not a formal appraisal. Have a qualified valuer or broker review any figure before relying on it.
