/**
 * Migration Script: Convert old_trades.csv to new Trades and LotActions format
 * 
 * This script parses the old ledger format and converts it to:
 * 1. Trades.csv - Actual buy/sell transactions
 * 2. LotActions.csv - Transfers, splits, gifts, and other lot-level actions
 * 
 * LLM Integration (optional):
 * - Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable
 * - Or create llm-config.json with { "provider": "openai", "apiKey": "...", "model": "gpt-4o-mini" }
 * 
 * Usage:
 *   node migrate-trades.js              # Process all trades
 *   node migrate-trades.js ISRG         # Filter for specific symbol
 *   node migrate-trades.js --output ./my-output  # Custom output directory
 */

const fs = require('fs');
const path = require('path');

// Mapping from old Platform names to new BrokerId
const PLATFORM_TO_BROKER = {
    'Apex': 'APEX',
    'Saxo': 'SAXO',
    'DBS': 'DBS',
    'IBKR': 'IBKR',
    'Schwab': 'SCHWAB',
    'ICICI': 'ICICI',
    'HDFC': 'HDFC'
};

// Mapping from old Owner codes to new OwnerId
// DC/RC/IC -> DC (primary owner for joint accounts)
const OWNER_MAPPING = {
    'DC': 'DC',
    'DC/RC': 'DC',
    'DC/RC/IC': 'DC',
    'DC/IC': 'DC',
    'RC': 'RC',
    'IC': 'IC',
    'M': 'M',
    'SS/IC': 'SS'
};

// Display name for brokers (title case for notes)
const BROKER_DISPLAY_NAMES = {
    'APEX': 'Apex',
    'SAXO': 'Saxo',
    'DBS': 'DBS',
    'IBKR': 'IBKR',
    'SCHWAB': 'Schwab',
    'ICICI': 'ICICI',
    'HDFC': 'HDFC'
};

// Known account IDs for owners at specific brokers
// Used when source data has missing account IDs
const KNOWN_ACCOUNTS = {
    'IBKR': {
        'DC': 'U4535230',
        'SS': 'U3741128',
        'IC': 'U3741128'  // IC uses SS's account for gifts
    },
    'DBS': {
        'DC': 'S-578426-0',
        'IC': 'S-585727-0'
    }
};

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Convert MM/DD/YYYY to YYYY-MM-DD
function convertDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Format split notes from instrument description
function formatSplitNotes(instrument, symbol) {
    // Extract the split ratio
    const match = instrument.match(/(\d+)\s*[:\-]\s*(\d+)/);
    if (match) {
        const num = match[1];
        const denom = match[2];
        // Try to extract company name from symbol or use generic
        const companyNames = {
            'ISRG': 'Intuitive Surgical',
            'AAPL': 'Apple',
            'TSLA': 'Tesla',
            'NVDA': 'NVIDIA',
            'GOOGL': 'Alphabet',
            'GOOG': 'Alphabet',
            'AMZN': 'Amazon',
            'CRM': 'Salesforce',
            'BRK.B': 'Berkshire Hathaway',
            'SHOP': 'Shopify',
            'NFLX': 'Netflix'
        };
        const companyName = companyNames[symbol] || symbol;
        return `${companyName} ${num}-for-${denom} stock split`;
    }
    return instrument;
}

// Parse old trades CSV
function parseOldTrades(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = parseCSVLine(lines[0]);

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const record = {};
        headers.forEach((header, idx) => {
            record[header] = values[idx] || '';
        });
        record._lineNumber = i + 1;
        records.push(record);
    }
    return records;
}

// Detect transaction type from B/S and Instrument fields
function detectTransactionType(record) {
    const bs = record['B/S'] || '';
    const instrument = record['Instrument'] || '';
    const amount = parseFloat(record['Amount']) || 0;

    const instrumentLower = instrument.toLowerCase();

    // Check for splits
    if (instrumentLower.includes('stock split') || instrumentLower.includes('split')) {
        return 'SPLIT';
    }

    // Check for bonus issues
    if (instrumentLower.includes('bonus issue') || instrumentLower.includes('bonus')) {
        return 'BONUS';
    }

    // Check for transfers
    if (bs === 'TransferIn') {
        return 'TRANSFER_IN';
    }
    if (bs === 'TransferOut') {
        return 'TRANSFER_OUT';
    }

    // Regular trades
    if (bs === 'Bought' && amount > 0) {
        return 'BUY';
    }
    if (bs === 'Sold' && amount < 0) {
        return 'SELL';
    }

    return 'UNKNOWN';
}

// Extract split ratio from instrument description
function extractSplitRatio(instrument) {
    // Common patterns: "Stock Split 3:1", "Stock split 50:1", "Split 7:1"
    const match = instrument.match(/(\d+)\s*:\s*(\d+)/);
    if (match) {
        return {
            numerator: parseInt(match[1]),
            denominator: parseInt(match[2])
        };
    }
    return null;
}

// Generate ActionId for lot actions
function generateActionId(record, actionType, fromBroker, toBroker, fromOwner, toOwner, existingIds = new Set()) {
    const symbol = record['Symbol'] || '';
    const date = convertDate(record['TradeTime'] || '');
    const year = date.substring(0, 4);

    let baseId;
    switch (actionType) {
        case 'SPLIT':
            baseId = `${symbol}_SPLIT_${year}`;
            break;
        case 'TRANSFER':
            baseId = `${symbol}_${fromBroker}_${toBroker}`;
            break;
        case 'GIFT':
            baseId = `${symbol}_${fromBroker}_GIFT_${toOwner}`;
            break;
        case 'BONUS':
            baseId = `${symbol}_BONUS_${year}`;
            break;
        default:
            baseId = `${symbol}_ACTION_${year}`;
    }

    // Ensure uniqueness
    let id = baseId;
    let counter = 1;
    while (existingIds.has(id)) {
        id = `${baseId}_${counter}`;
        counter++;
    }
    existingIds.add(id);
    return id;
}

// Determine owner from record
function getOwner(record) {
    const owner = record['Owner'] || '';
    return OWNER_MAPPING[owner] || owner.split('/')[0] || 'DC';
}

// Main processing function
async function processTrades(records, filterSymbol = null) {
    const trades = [];
    const lotActions = [];
    const actionIds = new Set();

    // Track processed splits to avoid duplicates (same symbol+date+ratio)
    const processedSplits = new Set();

    // Collect all transfer records by symbol and date
    const transfersBySymbolDate = new Map();

    // First pass: collect all transfers grouped by symbol+date
    for (const record of records) {
        if (filterSymbol && record['Symbol'] !== filterSymbol) continue;

        const txType = detectTransactionType(record);
        if (txType === 'TRANSFER_IN' || txType === 'TRANSFER_OUT') {
            const key = `${record['Symbol']}_${record['TradeTime']}`;
            if (!transfersBySymbolDate.has(key)) {
                transfersBySymbolDate.set(key, []);
            }
            transfersBySymbolDate.get(key).push({
                record,
                type: txType,
                broker: PLATFORM_TO_BROKER[record['Platform']] || record['Platform'],
                owner: getOwner(record),
                qty: Math.abs(parseFloat(record['Amount']) || 0),
                used: false
            });
        }
    }

    // Second pass: pair transfers intelligently
    // For each group, match TransferOut with TransferIn by finding compatible pairs
    const pairedTransfers = [];
    for (const [key, transfers] of transfersBySymbolDate) {
        const outs = transfers.filter(t => t.type === 'TRANSFER_OUT' && !t.used);
        const ins = transfers.filter(t => t.type === 'TRANSFER_IN' && !t.used);

        // Try to pair each OUT with a matching IN
        for (const out of outs) {
            // Find matching IN: same quantity, compatible broker/owner
            // Priority 1: Same broker, different owner (gift within broker)
            // Priority 2: Different broker (transfer between brokers)
            let matchingIn = null;

            // First, look for same-broker gift (different owners)
            matchingIn = ins.find(i => !i.used && i.broker === out.broker && i.owner !== out.owner && Math.abs(i.qty - out.qty) < 0.001);

            // If no same-broker gift, look for cross-broker transfer
            if (!matchingIn) {
                matchingIn = ins.find(i => !i.used && i.broker !== out.broker && Math.abs(i.qty - out.qty) < 0.001);
            }

            // If still no match, just try any unmatched IN with same quantity
            if (!matchingIn) {
                matchingIn = ins.find(i => !i.used && Math.abs(i.qty - out.qty) < 0.001);
            }

            if (matchingIn) {
                out.used = true;
                matchingIn.used = true;
                pairedTransfers.push({ out: out.record, in: matchingIn.record });
            }
        }
    }

    // Create a lookup for paired transfers
    const transferPairs = new Map();
    const processedTransferRecords = new Set();
    for (const pair of pairedTransfers) {
        // Use both records as keys pointing to the pair
        const outKey = `${pair.out['Symbol']}_${pair.out['TradeTime']}_${pair.out['Platform']}_${pair.out['Amount']}`;
        const inKey = `${pair.in['Symbol']}_${pair.in['TradeTime']}_${pair.in['Platform']}_${pair.in['Amount']}`;
        transferPairs.set(outKey, pair);
        transferPairs.set(inKey, pair);
    }

    // Process all records
    for (const record of records) {
        if (filterSymbol && record['Symbol'] !== filterSymbol) continue;

        const txType = detectTransactionType(record);
        const symbol = record['Symbol'] || '';
        const date = convertDate(record['TradeTime'] || '');
        const platform = record['Platform'] || '';
        const broker = PLATFORM_TO_BROKER[platform] || platform;
        const accountId = record['Account ID'] || '';
        const owner = getOwner(record);
        const amount = Math.abs(parseFloat(record['Amount']) || 0);
        const price = parseFloat(record['Price']) || 0;
        const fxRate = parseFloat(record['Currency Ratio']) || 0;
        const instrument = record['Instrument'] || '';

        switch (txType) {
            case 'BUY':
            case 'SELL':
                // Skip if price is 0 and amount is 0 (likely not a real trade)
                if (price === 0 && amount === 0) continue;

                trades.push({
                    TradeDate: date,
                    OwnerId: owner,
                    BrokerId: broker,
                    AccountId: accountId,
                    SecurityId: symbol,
                    Side: txType,
                    Quantity: amount,
                    Price: price,
                    Fees: 0,
                    FXRateToINR: fxRate,
                    Notes: '',
                    SourceRef: ''
                });
                break;

            case 'SPLIT':
                const splitRatio = extractSplitRatio(instrument);
                if (splitRatio) {
                    // Deduplicate splits (same symbol+date+ratio should only appear once)
                    const splitKey = `${symbol}_${date}_${splitRatio.numerator}_${splitRatio.denominator}`;
                    if (processedSplits.has(splitKey)) continue;
                    processedSplits.add(splitKey);

                    const actionId = generateActionId(record, 'SPLIT', '', '', '', '', actionIds);
                    const splitNotes = formatSplitNotes(instrument, symbol);
                    lotActions.push({
                        ActionId: actionId,
                        ActionDate: date,
                        ActionType: 'SPLIT',
                        OwnerFromId: '',
                        OwnerToId: '',
                        BrokerFromId: '',
                        BrokerToId: '',
                        AccountFromId: '',
                        AccountToId: '',
                        SecurityId: symbol,
                        SecurityToId: '',
                        SplitNumerator: splitRatio.numerator,
                        SplitDenominator: splitRatio.denominator,
                        Quantity: '',
                        Notes: splitNotes,
                        SourceRef: `${symbol}_SPLIT_HISTORY`
                    });
                }
                break;

            case 'BONUS':
                // Bonus issues are similar to splits but with different semantics
                // For now, treat them as splits with additional shares
                const bonusRatio = extractSplitRatio(instrument);
                if (bonusRatio) {
                    const actionId = generateActionId(record, 'BONUS', '', '', '', '', actionIds);
                    lotActions.push({
                        ActionId: actionId,
                        ActionDate: date,
                        ActionType: 'BONUS',
                        OwnerFromId: '',
                        OwnerToId: '',
                        BrokerFromId: '',
                        BrokerToId: '',
                        AccountFromId: '',
                        AccountToId: '',
                        SecurityId: symbol,
                        SecurityToId: '',
                        SplitNumerator: bonusRatio.numerator + bonusRatio.denominator,
                        SplitDenominator: bonusRatio.denominator,
                        Quantity: '',
                        Notes: instrument,
                        SourceRef: ''
                    });
                }
                break;

            case 'TRANSFER_IN':
            case 'TRANSFER_OUT':
                // Look up this record in our paired transfers
                const recordKey = `${record['Symbol']}_${record['TradeTime']}_${record['Platform']}_${record['Amount']}`;
                if (processedTransferRecords.has(recordKey)) continue;

                const pair = transferPairs.get(recordKey);
                if (pair) {
                    const outRecord = pair.out;
                    const inRecord = pair.in;

                    const fromOwner = getOwner(outRecord);
                    const toOwner = getOwner(inRecord);
                    const fromBroker = PLATFORM_TO_BROKER[outRecord['Platform']] || outRecord['Platform'];
                    const toBroker = PLATFORM_TO_BROKER[inRecord['Platform']] || inRecord['Platform'];
                    // Use source account or fall back to known accounts
                    const fromAccount = outRecord['Account ID'] ||
                        (KNOWN_ACCOUNTS[fromBroker] && KNOWN_ACCOUNTS[fromBroker][fromOwner]) || '';
                    const toAccount = inRecord['Account ID'] ||
                        (KNOWN_ACCOUNTS[toBroker] && KNOWN_ACCOUNTS[toBroker][toOwner]) || '';
                    const qty = Math.abs(parseFloat(outRecord['Amount']) || parseFloat(inRecord['Amount']) || 0);

                    // Skip same-broker, same-account transfers (cost basis adjustments)
                    if (fromBroker === toBroker && fromAccount === toAccount) {
                        // Mark both records as processed
                        const outKey = `${outRecord['Symbol']}_${outRecord['TradeTime']}_${outRecord['Platform']}_${outRecord['Amount']}`;
                        const inKey = `${inRecord['Symbol']}_${inRecord['TradeTime']}_${inRecord['Platform']}_${inRecord['Amount']}`;
                        processedTransferRecords.add(outKey);
                        processedTransferRecords.add(inKey);
                        continue;
                    }

                    // Mark both records as processed
                    const outKey = `${outRecord['Symbol']}_${outRecord['TradeTime']}_${outRecord['Platform']}_${outRecord['Amount']}`;
                    const inKey = `${inRecord['Symbol']}_${inRecord['TradeTime']}_${inRecord['Platform']}_${inRecord['Amount']}`;
                    processedTransferRecords.add(outKey);
                    processedTransferRecords.add(inKey);

                    // Determine if this is a GIFT (different owners) or TRANSFER (same owner)
                    const isGift = fromOwner !== toOwner;
                    const actionType = isGift ? 'GIFT' : 'TRANSFER';

                    const actionId = generateActionId(outRecord, actionType, fromBroker, toBroker, fromOwner, toOwner, actionIds);
                    // Use display names for notes (title case)
                    const fromBrokerDisplay = BROKER_DISPLAY_NAMES[fromBroker] || fromBroker;
                    const toBrokerDisplay = BROKER_DISPLAY_NAMES[toBroker] || toBroker;
                    const notes = isGift
                        ? `Gift from ${fromOwner} to ${toOwner}`
                        : `${fromBrokerDisplay} to ${toBrokerDisplay}`;

                    lotActions.push({
                        ActionId: actionId,
                        ActionDate: date,
                        ActionType: actionType,
                        OwnerFromId: fromOwner,
                        OwnerToId: toOwner,
                        BrokerFromId: fromBroker,
                        BrokerToId: toBroker,
                        AccountFromId: fromAccount,
                        AccountToId: toAccount,
                        SecurityId: symbol,
                        SecurityToId: '',
                        SplitNumerator: '',
                        SplitDenominator: '',
                        Quantity: qty,
                        Notes: notes,
                        SourceRef: ''
                    });
                }
                break;
        }
    }

    return { trades, lotActions };
}

// Format trades as CSV
function formatTradesCSV(trades) {
    const headers = ['TradeDate', 'OwnerId', 'BrokerId', 'AccountId', 'SecurityId',
        'Side', 'Quantity', 'Price', 'Fees', 'FXRateToINR', 'Notes', 'SourceRef'];
    const lines = [headers.join('\t')];

    for (const trade of trades) {
        const values = headers.map(h => trade[h] ?? '');
        lines.push(values.join('\t'));
    }

    return lines.join('\n');
}

// Format lot actions as CSV
function formatLotActionsCSV(lotActions) {
    const headers = ['ActionId', 'ActionDate', 'ActionType', 'OwnerFromId', 'OwnerToId',
        'BrokerFromId', 'BrokerToId', 'AccountFromId', 'AccountToId',
        'SecurityId', 'SecurityToId', 'SplitNumerator', 'SplitDenominator',
        'Quantity', 'Notes', 'SourceRef'];
    const lines = [headers.join('\t')];

    for (const action of lotActions) {
        const values = headers.map(h => action[h] ?? '');
        lines.push(values.join('\t'));
    }

    return lines.join('\n');
}

// Import LLM helper (optional - will work without it)
let llmHelper = null;
try {
    llmHelper = require('./llm-helper');
    if (llmHelper.LLM_CONFIG.enabled) {
        console.log(`LLM integration enabled (provider: ${llmHelper.LLM_CONFIG.provider})`);
    }
} catch (e) {
    // LLM helper not available
}

// LLM helper for complex extractions
async function callLLM(prompt) {
    if (llmHelper && llmHelper.LLM_CONFIG.enabled) {
        return llmHelper.callLLM(prompt);
    }
    return null;
}

// Main function
async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let filterSymbol = null;
    let outputDir = './output';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--output' && args[i + 1]) {
            outputDir = args[i + 1];
            i++; // Skip next arg
        } else if (!args[i].startsWith('--')) {
            filterSymbol = args[i];
        }
    }

    // Read input file (look in parent directory for old_trades.csv)
    let inputFile = path.join(__dirname, 'old_trades.csv');
    if (!fs.existsSync(inputFile)) {
        inputFile = path.join(__dirname, '..', 'old_trades.csv');
    }
    if (!fs.existsSync(inputFile)) {
        console.error('Error: old_trades.csv not found in migration folder or parent directory');
        process.exit(1);
    }

    const csvContent = fs.readFileSync(inputFile, 'utf-8');
    const records = parseOldTrades(csvContent);

    console.log(`Parsed ${records.length} records from old_trades.csv`);
    if (filterSymbol) {
        console.log(`Filtering for symbol: ${filterSymbol}`);
    }

    // Process trades
    const { trades, lotActions } = await processTrades(records, filterSymbol);

    console.log(`Generated ${trades.length} trades`);
    console.log(`Generated ${lotActions.length} lot actions`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output files
    const tradesCSV = formatTradesCSV(trades);
    const lotActionsCSV = formatLotActionsCSV(lotActions);

    // Sanitize symbol for filename (replace : with _)
    const safeSymbol = filterSymbol ? filterSymbol.replace(/:/g, '_') : null;
    const tradesFile = path.join(outputDir, safeSymbol ? `Trades_${safeSymbol}.csv` : 'Trades.csv');
    const actionsFile = path.join(outputDir, safeSymbol ? `LotActions_${safeSymbol}.csv` : 'LotActions.csv');

    fs.writeFileSync(tradesFile, tradesCSV);
    fs.writeFileSync(actionsFile, lotActionsCSV);

    console.log(`\nOutput written to:`);
    console.log(`  Trades: ${tradesFile}`);
    console.log(`  LotActions: ${actionsFile}`);

    // Print preview
    console.log('\n--- Trades Preview ---');
    console.log(tradesCSV.split('\n').slice(0, 10).join('\n'));

    console.log('\n--- LotActions Preview ---');
    console.log(lotActionsCSV.split('\n').slice(0, 10).join('\n'));
}

main().catch(console.error);