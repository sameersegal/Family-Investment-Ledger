# Neo Ledger

A Google Apps Script-based investment portfolio ledger that tracks securities, computes lot-based gains, and generates tax summaries. Supports both Google Sheets (production) and local Node.js testing.

## Features

### Core Functionality

- **Lot Tracking (FIFO)**: Tracks individual purchase lots with cost basis, supporting:
  - Buy/Sell transactions
  - Stock splits
  - Transfers between accounts
  - Gifts between owners
  - Class reorganizations (e.g., Alphabet GOOGL→GOOG split)

- **Realized Gains Computation**: Calculates capital gains with:
  - Short-term vs Long-term classification based on holding period
  - INR cost basis tracking with FX rates
  - Per-lot gain/loss attribution

- **Tax Summary**: Aggregates gains by:
  - Financial Year (April–March)
  - Asset Class
  - Gain Type (STCG/LTCG)
  - Applies exemptions and tax rates from configuration

- **XIRR Cashflows**: Generates cashflow data for portfolio XIRR calculation using Google Finance prices

- **Cash Balance Tracking**: Maintains cash balances by account and currency

- **RBI 180-Day Compliance**: Tracks foreign income aging for regulatory compliance

### Portfolio Views

- India Portfolio & US Portfolio summary sheets
- Equity by Account QC (quality control) view

## Project Structure

```
neo-ledger/
├── Code.js              # Main business logic
├── Helpers.js           # Utility functions & data access layer
├── Original.js          # Legacy/reference code
├── csv-to-json.js       # Data conversion utility
├── test-local.js        # Local test runner (Node.js)
├── appsscript.json      # Google Apps Script manifest
└── data/                # Sample/test data (JSON files)
    ├── Trades.json
    ├── Securities.json
    ├── Entities.json
    ├── LotActions.json
    ├── Config.json
    ├── CashMovements.json
    ├── Lots_Current.json     # Output: Current open lots
    ├── LotConsumes.json      # Output: Lot consumption records
    ├── Gains_Realized.json   # Output: Realized gains
    ├── Tax_Summary_FY.json   # Output: Tax summary by FY
    ├── Cash_Balances.json    # Output: Cash balances
    ├── XIRR_Cashflows.json   # Output: XIRR cashflows
    └── ...
```

## Data Model

### Input Tables

| Table | Description |
|-------|-------------|
| **Config** | Tax rules: holding periods, rates, exemptions by asset class |
| **Entities** | Owners, brokers, accounts |
| **Securities** | Security master with ticker, asset class, country |
| **Trades** | Buy/Sell transactions with quantity, price, FX rate |
| **LotActions** | Corporate actions: splits, transfers, gifts, reorganizations |
| **CashMovements** | Cash inflows/outflows with currency |

### Output Tables

| Table | Description |
|-------|-------------|
| **Lots_Current** | Open lots with cost basis and quantity |
| **LotConsumes** | Records of lot consumption (sales) |
| **Gains_Realized** | Computed gains with holding period classification |
| **Tax_Summary_FY** | Aggregated tax liability by financial year |
| **Cash_Balances** | Cash positions by account/currency |
| **XIRR_Cashflows** | Cashflows for XIRR calculation |
| **RBI_180_Ageing** | Foreign income aging buckets |
| **QC_Equity_By_Account** | Position reconciliation view |

## Usage

### Google Sheets (Production)

1. Create a Google Sheet with the required input tables
2. Open **Extensions > Apps Script**
3. Copy `Code.js` and `Helpers.js` into the script editor
4. Run `rebuildAllDerived()` to compute all derived tables

### Local Testing (Node.js)

1. Ensure sample data exists in the `data/` folder as JSON files
2. Run the test:
   ```bash
   node test-local.js
   ```
3. Output files will be written to the `data/` folder

## Main Functions

| Function | Description |
|----------|-------------|
| `rebuildLots()` | Process trades and actions to build current lots |
| `rebuildXIRRCashflows()` | Generate XIRR cashflow records |
| `computeRealizedGains()` | Calculate gains from lot consumes |
| `buildTaxSummaryByFY()` | Aggregate tax summary by financial year |
| `computeCashBalances()` | Compute cash balances by account |
| `computeRBI180DayExposure()` | Track foreign income aging |
| `rebuildAllDerived()` | Run all computations in sequence |

## Configuration

Tax rules are configured in the `Config` table with fields:
- `AssetClass`: e.g., "Equity", "Mutual Fund"
- `HoldingPeriod_LT_Days`: Days to qualify for long-term gains
- `LTCG_Tax_Rate`: Long-term capital gains tax rate
- `STCG_Tax_Rate`: Short-term capital gains tax rate
- `LTCG_Exemption_INR`: Annual exemption amount

## Local vs Production Mode

The `IS_LOCAL` flag in `Helpers.js` controls the execution mode:
- `false` (default): Uses Google Sheets APIs
- `true`: Uses local JSON files in `data/` folder
