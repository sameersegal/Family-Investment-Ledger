# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # Run all tests (local + fixture regression + API validation)
npm run generate:types    # Regenerate TypeScript declarations from JSON Schema
npm run deploy:gas        # Generate types then push to Google Apps Script via clasp

node test-local.js --test                    # Run local test only
node tests/verify-fixture-outputs.js         # Run fixture regression only
node test-local.js --test --data=path/to/dir # Run with custom test data
```

## Architecture

**Neo Ledger** is a Google Apps Script investment portfolio ledger that tracks securities with FIFO lot-based gains computation and Indian tax summaries. It runs in Google Sheets (production) and Node.js (local testing).

### Dual-Mode Design

`Helpers.js` abstracts all I/O behind a polymorphic layer controlled by `IS_LOCAL`:
- **Google Sheets mode** (`IS_LOCAL = false`): reads/writes via `SpreadsheetApp`
- **Node.js mode** (`IS_LOCAL = true`): reads/writes JSON files from disk

Both modes expose identical functions: `readTable(name)`, `writeTable(name, rows)`, `resetSheet(name)`.

### Core Files

- **Code.js** — All business logic. Entry point is `rebuildAllDerived()` which orchestrates the full pipeline: `rebuildLots()` → `rebuildXIRRCashflows()` → `computeRealizedGains()` → `buildTaxSummaryByFY()` → `computeCashBalances()` → `computeRBI180DayExposure()` → portfolio sheets → `buildEquityByAccountQC()` → `buildSensitivityData()`.
- **Helpers.js** — Data access layer, date utilities (`fyFromDate`, `daysBetween`), tax rate parsing. Provides the dual-mode abstraction.
- **schema/neo-ledger-data-model.schema.json** — Single source of truth for all data types. Generated types live in `types/neo-ledger.generated.d.ts`.

### Data Flow

**6 input tables** (Config, Entities, Securities, Trades, LotActions, CashMovements) → `rebuildAllDerived()` → **12 derived output tables** (Lots_Current, LotConsumes, Gains_Realized, Tax_Summary_FY, Cash_Balances, XIRR_Cashflows, RBI_180_Ageing, QC_Equity_By_Account, Sensitivity_Data, Sensitivity_Summary, IND/US Portfolio).

### Key Domain Concepts

- **FIFO Lot Processing**: Trades and LotActions are merged, sorted chronologically with type priority (BUY:1, SPLIT:2, BONUS:2, MERGER:3, SELL:4, GIFT:5, TRANSFER:6), then processed sequentially. Sales consume lots in FIFO order.
- **Financial Year**: April–March (Indian FY). `fyFromDate("2026-01-07")` → `"2025-2026"`.
- **Holding Period**: Days between buy and sell. Short-term vs long-term threshold from Config per AssetClass.
- **Multi-Currency**: FX rates stored per lot at buy (`BuyFXRate`) and applied at sale (`SaleFXRate`) for INR conversion.
- **LotAction Types**: SPLIT (adjust qty/price), BONUS (zero-cost new lot), MERGER (convert shares N:1), CLASS_REORG (split cost between securities), GIFT/TRANSFER (reassign owner).

### Testing

- **test-local.js**: Sandboxes Code.js + Helpers.js in Node.js `vm`, runs `rebuildAllDerived()`, validates via `Assertions.json`.
- **tests/verify-fixture-outputs.js**: Golden-file regression — compares 10 output files against expected results in `tests/data/` using `assert.deepStrictEqual`.
- **tests/verify-sensitivity-data.js**: Validates sensitivity data transformations for specific tickers.

Test fixtures are committed in `tests/data/` (20 JSON files covering all input and expected output tables).

### Utilities

- **csv-to-json.js** — CSV-to-JSON converter for sheet data.
- **download-sheets.js** — Downloads live Google Sheets data via OAuth (requires `credentials.json`).

### Web API (API.js)

`API.js` exposes a Google Apps Script web app for external ingestion of transactions.

**GET endpoints** (`?action=...`): `config`, `entities`, `securities`, `schema` — read reference data.

**POST endpoints** (`action` in body):
- `validate` — Schema + FK + duplicate checks without writing.
- `ingest` — Validate → append to sheets → `rebuildAllDerived()` → rollback on failure.

Validation pipeline: field types/enums → referential integrity (FK checks against Entities, Securities) → duplicate ID check → rebuild safety net.

### Conventions

- No linter or formatter configured; code uses 4-space indentation.
- PascalCase for types, camelCase for functions/variables.
- Schema changes require running `npm run generate:types` to update TypeScript declarations.
- Timezone: Asia/Kolkata (configured in `appsscript.json`).
