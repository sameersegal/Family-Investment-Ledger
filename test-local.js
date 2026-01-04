/**
 * Local Test Runner for neo-ledger
 * 
 * Run this file with Node.js to test the ledger logic locally.
 * Make sure you have sample data JSON files in the data/ folder.
 * 
 * Usage:
 *   node test-local.js              # Uses real data from data/ folder
 *   node test-local.js --test       # Uses test data from tests/data/ folder
 *   node test-local.js --data=path  # Uses data from custom path
 */

// For Node.js compatibility, we need to load files differently
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Parse command line arguments for data folder selection
function getDataFolder() {
    const args = process.argv.slice(2);

    for (const arg of args) {
        if (arg === '--test') {
            return path.join(__dirname, 'tests', 'data');
        }
        if (arg.startsWith('--data=')) {
            const customPath = arg.substring('--data='.length);
            // Support both absolute and relative paths
            return path.isAbsolute(customPath) ? customPath : path.join(__dirname, customPath);
        }
    }

    // Default to real data folder
    return path.join(__dirname, 'data');
}

const DATA_FOLDER = getDataFolder();

// Create a context with globals that mimic Apps Script environment
const context = {
    console: console,
    require: require,
    __dirname: __dirname,
    Date: Date,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Math: Math,
    JSON: JSON,
    Error: Error,
    isNaN: isNaN,
    // IS_LOCAL will be set by Helpers.js
};

// Make context properties accessible as globals
vm.createContext(context);

// Load Helpers.js first
const helpersCode = fs.readFileSync(path.join(__dirname, 'Helpers.js'), 'utf8');
vm.runInContext(helpersCode, context);

// Enable local mode and set data folder
context.IS_LOCAL = true;
context.DATA_FOLDER = DATA_FOLDER;

// Load Code.js
const codeCode = fs.readFileSync(path.join(__dirname, 'Code.js'), 'utf8');
vm.runInContext(codeCode, context);

console.log('=== Neo Ledger Local Test ===\n');
console.log('IS_LOCAL:', context.IS_LOCAL);
console.log('Data folder:', DATA_FOLDER);
console.log('');

/**** End State Validation ****/
function validateEndState() {
    const lots = JSON.parse(fs.readFileSync(path.join(DATA_FOLDER, 'Lots_Current.json'), 'utf8'));
    const assertions = JSON.parse(fs.readFileSync(path.join(DATA_FOLDER, 'Assertions.json'), 'utf8'));

    const errors = [];

    // Helper to sum quantities by owner, security, and optionally account
    function sumQty(owner, securityId, accountId) {
        return lots
            .filter(l => l.OwnerId === owner &&
                l.SecurityId === securityId &&
                (!accountId || l.AccountId === accountId))
            .reduce((sum, l) => sum + l.OpenQty, 0);
    }

    // Run assertions
    for (const a of assertions) {
        switch (a.type) {
            case 'quantity':
                const actual = sumQty(a.owner, a.security, a.account);
                if (actual !== a.expected) {
                    errors.push(`FAIL: ${a.desc} - expected ${a.expected}, got ${actual}`);
                }
                break;

            case 'no_negative':
                const negatives = lots.filter(l => l.OpenQty < 0);
                if (negatives.length > 0) {
                    errors.push(`FAIL: ${a.desc} - Negative quantities found: ${negatives.map(l => `${l.LotId}:${l.SecurityId}=${l.OpenQty}`).join(", ")}`);
                }
                break;

            case 'no_invalid':
                const invalid = lots.filter(l => isNaN(l.OpenQty) || l.OpenQty === undefined || l.OpenQty === null);
                if (invalid.length > 0) {
                    errors.push(`FAIL: ${a.desc} - Invalid quantities found: ${invalid.map(l => `${l.LotId}:${l.SecurityId}=${l.OpenQty}`).join(", ")}`);
                }
                break;

            default:
                console.warn(`Unknown assertion type: ${a.type}`);
        }
    }

    // Report results
    if (errors.length > 0) {
        console.error("\n=== VALIDATION ERRORS ===");
        errors.forEach(e => console.error(e));
        console.error("=========================\n");
        throw new Error(`Validation failed with ${errors.length} error(s)`);
    } else {
        console.log("✓ All end state validations passed");
    }
}

// Run the main rebuild function
try {
    console.log('Running rebuildAllDerived()...\n');
    vm.runInContext('rebuildAllDerived()', context);

    // Run validations after rebuild
    console.log('\nRunning validations...');
    validateEndState();

    console.log('\n=== Complete ===');
} catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
}