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

test('OPENING_BALANCE category is valid', function () {
    var result = context.validateRows_([{
        CashTxnId: 'CM_TEST2', TxnDate: '2025-01-01', OwnerId: 'ALICE',
        AccountId: 'ACCT001', Currency: 'USD', Amount: 5000,
        Category: 'OPENING_BALANCE', LinkedTradeId: '', LinkedActionId: '',
        IsForeignIncome: 'FALSE', Notes: '', SourceRef: 'TEST'
    }], 'CashMovements', context.CASH_MOVEMENT_FIELDS_);
    assert.strictEqual(result.length, 0, 'Expected no errors, got: ' + JSON.stringify(result));
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

// ── LotAction cross-field validation tests ──

console.log('\nLotAction cross-field rules:');

test('valid SPLIT with empty owner/account fields passes', function () {
    var result = context.validateLotActionRules_([{
        ActionType: 'SPLIT', SecurityId: 'NFLX',
        SplitNumerator: 10, SplitDenominator: 1,
        OwnerFromId: '', OwnerToId: '', BrokerFromId: '', BrokerToId: '',
        AccountFromId: '', AccountToId: '', SecurityToId: '', Quantity: ''
    }]);
    assert.strictEqual(result.length, 0, 'Expected no errors, got: ' + JSON.stringify(result));
});

test('SPLIT with OwnerFromId populated returns error', function () {
    var result = context.validateLotActionRules_([{
        ActionType: 'SPLIT', SecurityId: 'NFLX',
        SplitNumerator: 10, SplitDenominator: 1,
        OwnerFromId: 'ALICE', OwnerToId: '', BrokerFromId: '', BrokerToId: '',
        AccountFromId: '', AccountToId: '', SecurityToId: '', Quantity: ''
    }]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'INVALID_FOR_SPLIT');
    assert.strictEqual(result[0].field, 'OwnerFromId');
});

test('SPLIT with AccountFromId and BrokerId populated returns multiple errors', function () {
    var result = context.validateLotActionRules_([{
        ActionType: 'SPLIT', SecurityId: 'NFLX',
        SplitNumerator: 10, SplitDenominator: 1,
        OwnerFromId: '', OwnerToId: '', BrokerFromId: 'BROKER1', BrokerToId: '',
        AccountFromId: 'ACCT001', AccountToId: '', SecurityToId: '', Quantity: ''
    }]);
    assert.strictEqual(result.length, 2);
    var fields = result.map(function (e) { return e.field; }).sort();
    assert.strictEqual(fields[0], 'AccountFromId');
    assert.strictEqual(fields[1], 'BrokerFromId');
});

test('SPLIT missing SplitNumerator returns error', function () {
    var result = context.validateLotActionRules_([{
        ActionType: 'SPLIT', SecurityId: 'NFLX',
        SplitNumerator: '', SplitDenominator: 1,
        OwnerFromId: '', OwnerToId: '', BrokerFromId: '', BrokerToId: '',
        AccountFromId: '', AccountToId: '', SecurityToId: '', Quantity: ''
    }]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'REQUIRED_FOR_SPLIT');
    assert.strictEqual(result[0].field, 'SplitNumerator');
});

test('non-SPLIT action types skip SPLIT rules', function () {
    var result = context.validateLotActionRules_([{
        ActionType: 'GIFT', SecurityId: 'AAPL',
        SplitNumerator: '', SplitDenominator: '',
        OwnerFromId: 'ALICE', OwnerToId: 'BOB', BrokerFromId: '', BrokerToId: '',
        AccountFromId: 'ACCT001', AccountToId: 'ACCT002', SecurityToId: '', Quantity: 100
    }]);
    assert.strictEqual(result.length, 0, 'GIFT should not trigger SPLIT rules');
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

test('semantic duplicate LotAction (same SecurityId+Date+Type) caught', function () {
    var result = context.checkDuplicateIds_({
        trades: [],
        cashMovements: [],
        lotActions: [{ ActionId: 'NEW_SPLIT', SecurityId: 'AAPL', ActionDate: '2020-08-31', ActionType: 'SPLIT' }]
    });
    var dupAction = result.filter(function (e) { return e.code === 'DUPLICATE_ACTION'; });
    assert.strictEqual(dupAction.length, 1);
    assert.ok(dupAction[0].message.indexOf('AAPL') !== -1);
    assert.ok(dupAction[0].message.indexOf('2020-08-31') !== -1);
});

test('semantic duplicate LotAction within batch caught', function () {
    var result = context.checkDuplicateIds_({
        trades: [],
        cashMovements: [],
        lotActions: [
            { ActionId: 'NFLX_SPLIT_1', SecurityId: 'NFLX', ActionDate: '2025-06-01', ActionType: 'SPLIT' },
            { ActionId: 'NFLX_SPLIT_2', SecurityId: 'NFLX', ActionDate: '2025-06-01', ActionType: 'SPLIT' }
        ]
    });
    var dupAction = result.filter(function (e) { return e.code === 'DUPLICATE_ACTION'; });
    assert.strictEqual(dupAction.length, 1);
    assert.ok(dupAction[0].message.indexOf('duplicated in batch') !== -1);
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

// ── Auto-increment ID tests ──

console.log('\nAuto-increment IDs:');

test('generateIds_ assigns T009 for trades (existing T001-T008)', function () {
    var payload = {
        trades: [{
            TradeDate: '2025-06-15', OwnerId: 'ALICE',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'BUY', Quantity: 10, Price: 150, Fees: 5,
            FXRateToINR: 83, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    };
    var generated = context.generateIds_(payload);
    assert.strictEqual(generated.trades.length, 1);
    assert.strictEqual(generated.trades[0], 'T009');
    assert.strictEqual(payload.trades[0].TradeId, 'T009');
});

test('generateIds_ assigns CM009 for cash movements (existing CM001-CM008)', function () {
    var payload = {
        trades: [],
        cashMovements: [{
            TxnDate: '2025-06-15', OwnerId: 'ALICE',
            AccountId: 'ACCT001', Currency: 'USD', Amount: 500,
            Category: 'DEPOSIT', LinkedTradeId: '', LinkedActionId: '',
            IsForeignIncome: 'FALSE', Notes: '', SourceRef: 'TEST'
        }],
        lotActions: []
    };
    var generated = context.generateIds_(payload);
    assert.strictEqual(generated.cashMovements.length, 1);
    assert.strictEqual(generated.cashMovements[0], 'CM009');
    assert.strictEqual(payload.cashMovements[0].CashTxnId, 'CM009');
});

test('generateIds_ assigns sequential IDs for multiple rows', function () {
    var payload = {
        trades: [
            { TradeDate: '2025-06-15', OwnerId: 'ALICE', BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL', Side: 'BUY', Quantity: 10, Price: 150, Fees: 5, FXRateToINR: 83, Notes: '', SourceRef: 'TEST' },
            { TradeDate: '2025-06-16', OwnerId: 'ALICE', BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL', Side: 'BUY', Quantity: 5, Price: 155, Fees: 5, FXRateToINR: 83, Notes: '', SourceRef: 'TEST' }
        ],
        cashMovements: [],
        lotActions: []
    };
    var generated = context.generateIds_(payload);
    assert.strictEqual(generated.trades.length, 2);
    assert.strictEqual(generated.trades[0], 'T009');
    assert.strictEqual(generated.trades[1], 'T010');
});

test('generateIds_ skips rows that already have IDs', function () {
    var payload = {
        trades: [
            { TradeId: 'MANUAL01', TradeDate: '2025-06-15', OwnerId: 'ALICE', BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL', Side: 'BUY', Quantity: 10, Price: 150, Fees: 5, FXRateToINR: 83, Notes: '', SourceRef: 'TEST' },
            { TradeDate: '2025-06-16', OwnerId: 'ALICE', BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL', Side: 'BUY', Quantity: 5, Price: 155, Fees: 5, FXRateToINR: 83, Notes: '', SourceRef: 'TEST' }
        ],
        cashMovements: [],
        lotActions: []
    };
    var generated = context.generateIds_(payload);
    assert.strictEqual(payload.trades[0].TradeId, 'MANUAL01');
    assert.strictEqual(generated.trades.length, 1);
    assert.strictEqual(generated.trades[0], 'T009');
    assert.strictEqual(payload.trades[1].TradeId, 'T009');
});

test('generateIds_ considers batch IDs when computing max', function () {
    var payload = {
        trades: [
            { TradeId: 'T100', TradeDate: '2025-06-15', OwnerId: 'ALICE', BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL', Side: 'BUY', Quantity: 10, Price: 150, Fees: 5, FXRateToINR: 83, Notes: '', SourceRef: 'TEST' },
            { TradeDate: '2025-06-16', OwnerId: 'ALICE', BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL', Side: 'BUY', Quantity: 5, Price: 155, Fees: 5, FXRateToINR: 83, Notes: '', SourceRef: 'TEST' }
        ],
        cashMovements: [],
        lotActions: []
    };
    var generated = context.generateIds_(payload);
    assert.strictEqual(generated.trades.length, 1);
    assert.strictEqual(generated.trades[0], 'T101');
});

test('runValidation_ returns generatedIds in response', function () {
    var result = context.runValidation_({
        trades: [{
            TradeDate: '2025-06-15', OwnerId: 'ALICE',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'BUY', Quantity: 10, Price: 150, Fees: 5,
            FXRateToINR: 83, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.generatedIds, 'Expected generatedIds in response');
    assert.ok(result.generatedIds.trades.length === 1);
});

test('no generatedIds key when all IDs provided', function () {
    var result = context.runValidation_({
        trades: [{
            TradeId: 'MANUAL_TEST', TradeDate: '2025-06-15', OwnerId: 'ALICE',
            BrokerId: 'BROKER1', AccountId: 'ACCT001', SecurityId: 'AAPL',
            Side: 'BUY', Quantity: 10, Price: 150, Fees: 5,
            FXRateToINR: 83, Notes: '', SourceRef: 'TEST'
        }],
        cashMovements: [],
        lotActions: []
    });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.generatedIds, undefined, 'Should not have generatedIds when all provided');
});

// ── Bond transaction validation tests ──

console.log('\nBond transaction validation:');

test('valid BUY bond transaction passes', function () {
    var result = context.validateRows_([{
        BondTxnId: 'BT_TEST1', TxnDate: '2025-01-15',
        OwnerId: 'ALICE', AccountId: 'ACCT001', BrokerId: 'BROKER1',
        BondType: 'TBILL', Side: 'BUY', Currency: 'USD',
        FaceValue: 100, Price: 98.75, Quantity: 50,
        FXRate: 83.5, MaturityDate: '2025-04-15',
        Notes: '', SourceRef: 'TEST'
    }], 'Bond_Transactions', context.BOND_TXN_FIELDS_);
    assert.strictEqual(result.length, 0, 'Expected no errors, got: ' + JSON.stringify(result));
});

test('valid MATURITY bond transaction passes', function () {
    var result = context.validateRows_([{
        BondTxnId: 'BT_TEST2', TxnDate: '2025-04-15',
        OwnerId: 'ALICE', AccountId: 'ACCT001', BrokerId: 'BROKER1',
        BondType: 'TBILL', Side: 'MATURITY', Currency: 'USD',
        FaceValue: 100, Price: 100, Quantity: 50,
        FXRate: 84.2, MaturityDate: '2025-04-15',
        Notes: '', SourceRef: 'TEST'
    }], 'Bond_Transactions', context.BOND_TXN_FIELDS_);
    assert.strictEqual(result.length, 0, 'Expected no errors, got: ' + JSON.stringify(result));
});

test('invalid BondType returns error', function () {
    var result = context.validateRows_([{
        BondTxnId: 'BT_TEST3', TxnDate: '2025-01-15',
        OwnerId: 'ALICE', AccountId: 'ACCT001', BrokerId: 'BROKER1',
        BondType: 'CORPORATE', Side: 'BUY', Currency: 'USD',
        FaceValue: 100, Price: 98.75, Quantity: 50,
        FXRate: 83.5, MaturityDate: '2025-04-15',
        Notes: '', SourceRef: 'TEST'
    }], 'Bond_Transactions', context.BOND_TXN_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'INVALID_ENUM');
    assert.strictEqual(result[0].field, 'BondType');
});

test('invalid Side returns error', function () {
    var result = context.validateRows_([{
        BondTxnId: 'BT_TEST4', TxnDate: '2025-01-15',
        OwnerId: 'ALICE', AccountId: 'ACCT001', BrokerId: 'BROKER1',
        BondType: 'TBILL', Side: 'SELL', Currency: 'USD',
        FaceValue: 100, Price: 98.75, Quantity: 50,
        FXRate: 83.5, MaturityDate: '2025-04-15',
        Notes: '', SourceRef: 'TEST'
    }], 'Bond_Transactions', context.BOND_TXN_FIELDS_);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].code, 'INVALID_ENUM');
    assert.strictEqual(result[0].field, 'Side');
});

test('BondTxnId auto-increment works', function () {
    var payload = {
        trades: [],
        cashMovements: [],
        lotActions: [],
        bondTransactions: [{
            TxnDate: '2025-06-01',
            OwnerId: 'ALICE', AccountId: 'ACCT001', BrokerId: 'BROKER1',
            BondType: 'TBILL', Side: 'BUY', Currency: 'USD',
            FaceValue: 100, Price: 98, Quantity: 25,
            FXRate: 83, MaturityDate: '2025-09-01',
            Notes: '', SourceRef: 'TEST'
        }]
    };
    var generated = context.generateIds_(payload);
    assert.strictEqual(generated.bondTransactions.length, 1);
    assert.strictEqual(generated.bondTransactions[0], 'BT004');
    assert.strictEqual(payload.bondTransactions[0].BondTxnId, 'BT004');
});

test('runValidation_ with bondTransactions-only payload succeeds', function () {
    var result = context.runValidation_({
        trades: [],
        cashMovements: [],
        lotActions: [],
        bondTransactions: [{
            TxnDate: '2025-06-01',
            OwnerId: 'ALICE', AccountId: 'ACCT001', BrokerId: 'BROKER1',
            BondType: 'TBILL', Side: 'BUY', Currency: 'USD',
            FaceValue: 100, Price: 98, Quantity: 25,
            FXRate: 83, MaturityDate: '2025-09-01',
            Notes: '', SourceRef: 'TEST'
        }]
    });
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.generatedIds, 'Expected generatedIds');
    assert.ok(result.generatedIds.bondTransactions.length === 1);
});

// ── Summary ──

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
