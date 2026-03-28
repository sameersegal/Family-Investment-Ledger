/**
 * Tests for API.js validation logic.
 *
 * Loads API.js + Helpers.js + Code.js in a VM sandbox (like test-local.js)
 * and runs the validation functions against known-good and known-bad inputs.
 *
 * Usage: node tests/test-api-validation.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const DATA_FOLDER = path.join(__dirname, 'data');

// Set up VM context (same pattern as test-local.js)
const context = {
    console: console,
    require: require,
    __dirname: ROOT,
    Date: Date, Object: Object, Array: Array, Number: Number,
    String: String, Math: Math, JSON: JSON, Error: Error, isNaN: isNaN,
    // Stub SpreadsheetApp for readTable in GAS mode — we override to local mode below
    ContentService: {
        createTextOutput: function (text) {
            return { setMimeType: function () { return this; }, getContent: function () { return text; }, text_: text };
        },
        MimeType: { JSON: 'JSON' }
    }
};

vm.createContext(context);

// Load Helpers.js, enable local mode
vm.runInContext(fs.readFileSync(path.join(ROOT, 'Helpers.js'), 'utf8'), context);
context.IS_LOCAL = true;
context.DATA_FOLDER = DATA_FOLDER;

// Load Code.js (needed for rebuildAllDerived)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8'), context);

// Load API.js
vm.runInContext(fs.readFileSync(path.join(ROOT, 'API.js'), 'utf8'), context);

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  PASS: ' + name);
        passed++;
    } catch (err) {
        console.error('  FAIL: ' + name);
        console.error('    ' + err.message);
        failed++;
    }
}

console.log('\n=== API Validation Tests ===\n');

// ── Schema validation tests ──

console.log('Schema validation:');

test('valid trade row passes', function () {
    var result = context.validateRows_([{
        TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 0, 'Expected no errors, got: ' + JSON.stringify(result));
});

test('missing required field returns error', function () {
    var result = context.validateRows_([{
        TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
        // Missing TradeId
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'REQUIRED_FIELD');
    assert.strictEqual(result[0].field, 'TradeId');
});

test('invalid enum value returns error', function () {
    var result = context.validateRows_([{
        TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'HOLD', Quantity: 100, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'INVALID_ENUM');
    assert.strictEqual(result[0].field, 'Side');
});

test('invalid date format returns error', function () {
    var result = context.validateRows_([{
        TradeId: 'TEST001', TradeDate: '15-01-2025', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'INVALID_DATE');
});

test('negative quantity returns error', function () {
    var result = context.validateRows_([{
        TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'BUY', Quantity: -10, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].field, 'Quantity');
});

test('zero FXRateToINR returns error', function () {
    var result = context.validateRows_([{
        TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'BUY', Quantity: 10, Price: 50, Fees: 10,
        FXRateToINR: 0, Notes: '', SourceRef: 'TEST'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].field, 'FXRateToINR');
});

test('unknown field returns error', function () {
    var result = context.validateRows_([{
        TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST',
        ExtraField: 'oops'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'UNKNOWN_FIELD');
});

test('valid cash movement passes', function () {
    var result = context.validateRows_([{
        CashTxnId: 'CM_TEST1', TxnDate: '2025-01-15', OwnerId: 'ALICE',
        AccountId: 'ACCT001', Currency: 'USD', Amount: 1000,
        Category: 'DEPOSIT', LinkedTradeId: '', LinkedActionId: '',
        IsForeignIncome: 'FALSE', Notes: '', SourceRef: 'TEST'
    }], 'CashMovements', context.CASH_MOVEMENT_FIELDS_);
    assert.strictEqual(result.length, 0, 'Expected no errors, got: ' + JSON.stringify(result));
});

test('invalid cash category returns error', function () {
    var result = context.validateRows_([{
        CashTxnId: 'CM_TEST1', TxnDate: '2025-01-15', OwnerId: 'ALICE',
        AccountId: 'ACCT001', Currency: 'USD', Amount: 1000,
        Category: 'REFUND', LinkedTradeId: '', LinkedActionId: '',
        IsForeignIncome: 'FALSE', Notes: '', SourceRef: 'TEST'
    }], 'CashMovements', context.CASH_MOVEMENT_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'INVALID_ENUM');
    assert.strictEqual(result[0].field, 'Category');
});

test('multiple errors collected in single pass', function () {
    var result = context.validateRows_([{
        // Missing TradeId, invalid Side, negative Quantity
        TradeDate: '2025-01-15', OwnerId: 'ALICE',
        BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
        Side: 'HOLD', Quantity: -5, Price: 50, Fees: 10,
        FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
    }], 'Trades', context.TRADE_FIELDS_);
    assert.ok(result.length >= 3, 'Expected at least 3 errors, got ' + result.length);
});

// ── Referential integrity tests ──

console.log('\nReferential integrity:');

test('valid FKs pass integrity check', function () {
    var result = context.checkReferentialIntegrity_({
        trades: [{
            TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
            FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.length, 0, 'Expected no FK errors, got: ' + JSON.stringify(result));
});

test('invalid SecurityId caught', function () {
    var result = context.checkReferentialIntegrity_({
        trades: [{
            TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'ALICE',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'NONEXISTENT',
            Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
            FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'FK_INVALID');
    assert.strictEqual(result[0].field, 'SecurityId');
});

test('invalid OwnerId caught', function () {
    var result = context.checkReferentialIntegrity_({
        trades: [{
            TradeId: 'TEST001', TradeDate: '2025-01-15', OwnerId: 'NOBODY',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'BUY', Quantity: 100, Price: 50, Fees: 10,
            FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'FK_INVALID');
    assert.strictEqual(result[0].field, 'OwnerId');
});

// ── Duplicate ID tests ──

console.log('\nDuplicate IDs:');

test('duplicate TradeId with existing data caught', function () {
    var result = context.checkDuplicateIds_({
        trades: [{ TradeId: 'T001' }],  // T001 exists in fixture data
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'DUPLICATE_ID');
});

test('duplicate within batch caught', function () {
    var result = context.checkDuplicateIds_({
        trades: [{ TradeId: 'NEW001' }, { TradeId: 'NEW001' }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'DUPLICATE_ID');
    assert.ok(result[0].message.indexOf('duplicated in batch') !== -1);
});

test('unique new IDs pass', function () {
    var result = context.checkDuplicateIds_({
        trades: [{ TradeId: 'UNIQUE001' }],
        cashMovements: [{ CashTxnId: 'UNIQUE_CM001' }],
        lotActions: []
    });
    assert.strictEqual(result.length, 0);
});

// ── Full validation pipeline test ──

console.log('\nFull pipeline:');

test('runValidation_ with valid payload succeeds', function () {
    var result = context.runValidation_({
        trades: [{
            TradeId: 'PIPELINE_001', TradeDate: '2025-06-15', OwnerId: 'ALICE',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'BUY', Quantity: 10, Price: 150, Fees: 5,
            FXRateToINR: 83, Notes: 'Pipeline test', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.status, 'ok', 'Expected ok, got: ' + JSON.stringify(result));
});

test('runValidation_ with empty payload fails', function () {
    var result = context.runValidation_({ trades: [], cashMovements: [], lotActions: [] });
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.errors[0].code, 'INPUT_PARSE_ERROR');
});

test('runValidation_ catches schema errors before FK checks', function () {
    var result = context.runValidation_({
        trades: [{
            TradeId: '', TradeDate: 'bad-date', OwnerId: 'NOBODY',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'HOLD', Quantity: -1, Price: 50, Fees: 10,
            FXRateToINR: 75, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.status, 'error');
    // Should have schema errors but NOT FK errors (since we stop early)
    var hasFKError = result.errors.some(function (e) { return e.code === 'FK_INVALID'; });
    assert.strictEqual(hasFKError, false, 'FK checks should not run when schema validation fails');
});

// ── Summary ──

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
