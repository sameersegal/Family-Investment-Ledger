---
name: family-ledger
description: Query and manage the Neo Ledger family investment portfolio. Use when the user asks about portfolio data, securities, entities, trades, cash movements, config, tax rules, or wants to ingest new transactions.
argument-hint: "[config|entities|securities|schema|validate|ingest]"
---

# Neo Ledger API Skill

You interact with the Neo Ledger Google Apps Script web API to read portfolio reference data and ingest new transactions.

## Setup

The deployment ID **must** come from the environment variable `FAMILY_LEDGER_DEPLOYMENT_ID`. Never hardcode it.

```bash
BASE_URL="https://script.google.com/macros/s/${FAMILY_LEDGER_DEPLOYMENT_ID}/exec"
```

If the env var is not set, stop immediately and tell the user:
> Set the `FAMILY_LEDGER_DEPLOYMENT_ID` environment variable before using this skill.

## Read-Only GET Endpoints

Fetch data with:

```bash
curl -sL "${BASE_URL}?action=<action>"
```

| Action | Returns |
|--------|---------|
| `config` | Tax rules per asset class (holding periods, STCG/LTCG rates, exemptions) |
| `entities` | All owners, brokers, and accounts |
| `securities` | All tracked securities (ticker, exchange, asset class, currency) |
| `schema` | Field definitions, required fields, and enums for trades, cashMovements, lotActions |

Parse the JSON response. If `status` is `"ok"`, format `data` as a readable markdown table. If `status` is `"error"`, show the error details.

### Argument routing

- `/family-ledger config` or user asks about tax rules, holding periods, asset classes -> call `?action=config`
- `/family-ledger entities` or user asks about owners, brokers, accounts -> call `?action=entities`
- `/family-ledger securities` or user asks about tickers, stocks, securities -> call `?action=securities`
- `/family-ledger schema` or user asks about field definitions, what fields are needed -> call `?action=schema`
- `/family-ledger` with no argument -> show available actions as a help summary

## Write Endpoints (POST)

### Validate

Dry-run validation without writing. Use this to check data before ingesting.

```bash
curl -sL -X POST -H "Content-Type: application/json" \
  -d '{"action":"validate","trades":[...],"cashMovements":[...],"lotActions":[...]}' \
  "${BASE_URL}"
```

### Ingest

Validate, append to sheets, and rebuild all derived tables.

```bash
curl -sL -X POST -H "Content-Type: application/json" \
  -d '{"action":"ingest","trades":[...],"cashMovements":[...],"lotActions":[...]}' \
  "${BASE_URL}"
```

**Safety rules for ingest:**
1. Always run `validate` first and show the user the result.
2. Show the user exactly what rows will be ingested (formatted as a table).
3. Get explicit confirmation before calling `ingest`.
4. Never auto-ingest without user approval.

## Payload Format

Each payload can contain any combination of `trades`, `cashMovements`, and `lotActions` arrays. At least one must be non-empty.

### Trade row

```json
{
  "TradeId": "T_AAPL_20250615",
  "TradeDate": "2025-06-15",
  "OwnerId": "<from entities>",
  "BrokerId": "<from entities>",
  "AccountId": "<from entities>",
  "SecurityId": "<from securities>",
  "Side": "BUY|SELL",
  "Quantity": 10,
  "Price": 150.00,
  "Fees": 5.00,
  "FXRateToINR": 83.50,
  "Notes": "",
  "SourceRef": ""
}
```

### Cash movement row

```json
{
  "CashTxnId": "CM_001",
  "TxnDate": "2025-06-15",
  "OwnerId": "<from entities>",
  "AccountId": "<from entities>",
  "Currency": "USD|INR",
  "Amount": 1000.00,
  "Category": "DIVIDEND|INTEREST|TAX|FEE|DEPOSIT|WITHDRAWAL|FOREX|OTHER|BUY_SETTLEMENT|SELL_PROCEEDS|SALE_PROCEEDS|REINVESTMENT|REPATRIATION",
  "LinkedTradeId": "",
  "LinkedActionId": "",
  "IsForeignIncome": "TRUE|FALSE|",
  "Notes": "",
  "SourceRef": ""
}
```

### Lot action row

```json
{
  "ActionId": "LA_001",
  "ActionDate": "2025-06-15",
  "ActionType": "SPLIT|BONUS|MERGER|CLASS_REORG|GIFT|TRANSFER",
  "OwnerFromId": "",
  "OwnerToId": "",
  "BrokerFromId": "",
  "BrokerToId": "",
  "AccountFromId": "",
  "AccountToId": "",
  "SecurityId": "<from securities>",
  "SecurityToId": "",
  "SplitNumerator": "",
  "SplitDenominator": "",
  "Quantity": "",
  "Notes": "",
  "SourceRef": ""
}
```

## Error Handling

API errors return `{"status":"error","errors":[...]}`. Each error has:
- `code`: `REQUIRED_FIELD`, `INVALID_TYPE`, `INVALID_DATE`, `INVALID_ENUM`, `UNKNOWN_FIELD`, `FK_INVALID`, `DUPLICATE_ID`, `INPUT_PARSE_ERROR`, `REBUILD_FAILED`
- `message`: Human-readable description
- `table`, `row`, `field`: Location of the error (for row-level errors)

Format errors as a clear table grouped by error code.

## Tips

- When helping users build trade/cash payloads, first fetch `entities` and `securities` to get valid IDs.
- Dates must be `YYYY-MM-DD` format.
- `FXRateToINR` must be > 0 (use 1 for INR-denominated trades).
- `TradeId`, `CashTxnId`, `ActionId` must be unique across all existing data.
