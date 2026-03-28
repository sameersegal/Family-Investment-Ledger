/**** Neo Ledger Web API ****/

/**
 * Web API for Neo Ledger. Deployed as a Google Apps Script web app.
 *
 * GET endpoints (via ?action=...):
 *   ?action=config       — Returns Config table
 *   ?action=entities     — Returns Entities table
 *   ?action=securities   — Returns Securities table
 *   ?action=schema       — Returns validation schema (fields, enums, required)
 *
 * POST endpoints (via action in JSON body):
 *   { "action": "ingest", "trades": [...], "cashMovements": [...], "lotActions": [...] }
 *   { "action": "validate", "trades": [...], "cashMovements": [...], "lotActions": [...] }
 */

/* ─── GET handler ─── */

function doGet(e) {
    var action = (e && e.parameter && e.parameter.action) || '';
    var result;

    switch (action) {
        case 'config':
            result = handleRead_('Config');
            break;
        case 'entities':
            result = handleRead_('Entities');
            break;
        case 'securities':
            result = handleRead_('Securities');
            break;
        case 'schema':
            result = handleSchema_();
            break;
        default:
            result = { status: 'error', errors: [{ code: 'UNKNOWN_ACTION', message: 'Unknown action: ' + action }] };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

/* ─── POST handler ─── */

function doPost(e) {
    var payload;
    try {
        payload = JSON.parse(e.postData.contents);
    } catch (err) {
        return jsonResponse_({ status: 'error', errors: [{ code: 'INPUT_PARSE_ERROR', message: 'Invalid JSON: ' + err.message }] });
    }

    var action = payload.action || 'ingest';
    var result;

    switch (action) {
        case 'validate':
            result = runValidation_(payload);
            break;
        case 'ingest':
            result = runIngest_(payload);
            break;
        default:
            result = { status: 'error', errors: [{ code: 'UNKNOWN_ACTION', message: 'Unknown action: ' + action }] };
    }

    return jsonResponse_(result);
}

function jsonResponse_(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

/* ─── Read handler ─── */

function handleRead_(tableName) {
    try {
        var data = readTable(tableName);
        return { status: 'ok', data: data };
    } catch (err) {
        return { status: 'error', errors: [{ code: 'READ_FAILED', message: err.message }] };
    }
}

/* ─── Schema handler ─── */

function handleSchema_() {
    return {
        status: 'ok',
        data: {
            trades: {
                fields: TRADE_FIELDS_,
                required: ['TradeId', 'TradeDate', 'OwnerId', 'BrokerId', 'AccountId', 'SecurityId', 'Side', 'Quantity', 'Price', 'Fees', 'FXRateToINR', 'Notes', 'SourceRef'],
                idField: 'TradeId'
            },
            cashMovements: {
                fields: CASH_MOVEMENT_FIELDS_,
                required: ['CashTxnId', 'TxnDate', 'OwnerId', 'AccountId', 'Currency', 'Amount', 'Category', 'LinkedTradeId', 'LinkedActionId', 'IsForeignIncome', 'Notes', 'SourceRef'],
                idField: 'CashTxnId'
            },
            lotActions: {
                fields: LOT_ACTION_FIELDS_,
                required: ['ActionId', 'ActionDate', 'ActionType', 'OwnerFromId', 'OwnerToId', 'BrokerFromId', 'BrokerToId', 'AccountFromId', 'AccountToId', 'SecurityId', 'SecurityToId', 'SplitNumerator', 'SplitDenominator', 'Quantity', 'Notes', 'SourceRef'],
                idField: 'ActionId'
            }
        }
    };
}

/* ─── Field definitions (derived from schema) ─── */

var TRADE_FIELDS_ = {
    TradeId:    { type: 'identifier' },
    TradeDate:  { type: 'date' },
    OwnerId:    { type: 'identifier' },
    BrokerId:   { type: 'identifier' },
    AccountId:  { type: 'identifier' },
    SecurityId: { type: 'identifier' },
    Side:       { type: 'enum', values: ['BUY', 'SELL'] },
    Quantity:   { type: 'number', exclusiveMin: 0 },
    Price:      { type: 'number', min: 0 },
    Fees:       { type: 'number', min: 0 },
    FXRateToINR: { type: 'number', exclusiveMin: 0 },
    Notes:      { type: 'string' },
    SourceRef:  { type: 'string' }
};

var CASH_MOVEMENT_FIELDS_ = {
    CashTxnId:      { type: 'identifier' },
    TxnDate:        { type: 'date' },
    OwnerId:        { type: 'identifier' },
    AccountId:      { type: 'identifier' },
    Currency:       { type: 'identifier' },
    Amount:         { type: 'number' },
    Category:       { type: 'enum', values: ['DIVIDEND', 'INTEREST', 'TAX', 'FEE', 'DEPOSIT', 'WITHDRAWAL', 'FOREX', 'OTHER', 'BUY_SETTLEMENT', 'SELL_PROCEEDS', 'SALE_PROCEEDS', 'REINVESTMENT', 'REPATRIATION'] },
    LinkedTradeId:  { type: 'string' },
    LinkedActionId: { type: 'string' },
    IsForeignIncome: { type: 'boolean' },
    Notes:          { type: 'string' },
    SourceRef:      { type: 'string' }
};

var LOT_ACTION_FIELDS_ = {
    ActionId:        { type: 'identifier' },
    ActionDate:      { type: 'date' },
    ActionType:      { type: 'enum', values: ['SPLIT', 'BONUS', 'MERGER', 'CLASS_REORG', 'GIFT', 'TRANSFER'] },
    OwnerFromId:     { type: 'string' },
    OwnerToId:       { type: 'string' },
    BrokerFromId:    { type: 'string' },
    BrokerToId:      { type: 'string' },
    AccountFromId:   { type: 'string' },
    AccountToId:     { type: 'string' },
    SecurityId:      { type: 'identifier' },
    SecurityToId:    { type: 'string' },
    SplitNumerator:  { type: 'numberOrBlank' },
    SplitDenominator: { type: 'numberOrBlank' },
    Quantity:        { type: 'numberOrBlank' },
    Notes:           { type: 'string' },
    SourceRef:       { type: 'string' }
};

var TABLE_DEFS_ = {
    trades:        { sheetName: 'Trades',        fields: TRADE_FIELDS_,         idField: 'TradeId' },
    cashMovements: { sheetName: 'CashMovements', fields: CASH_MOVEMENT_FIELDS_, idField: 'CashTxnId' },
    lotActions:    { sheetName: 'LotActions',     fields: LOT_ACTION_FIELDS_,    idField: 'ActionId' }
};

/* ─── Validation ─── */

var DATE_RE_ = /^\d{4}-\d{2}-\d{2}$/;

function validateRows_(rows, tableName, fields) {
    var errors = [];
    var requiredFields = Object.keys(fields);

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];

        // Check required fields exist
        for (var f = 0; f < requiredFields.length; f++) {
            var field = requiredFields[f];
            var spec = fields[field];
            var val = row[field];

            // Missing field
            if (val === undefined || val === null) {
                errors.push({ table: tableName, row: i, field: field, value: null, code: 'REQUIRED_FIELD', message: 'Missing required field: ' + field });
                continue;
            }

            // Type checks
            switch (spec.type) {
                case 'identifier':
                    if (typeof val !== 'string' || val.length === 0) {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be a non-empty string' });
                    }
                    break;

                case 'date':
                    if (typeof val !== 'string' || !DATE_RE_.test(val)) {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_DATE', message: field + ' must be YYYY-MM-DD format' });
                    }
                    break;

                case 'enum':
                    if (spec.values.indexOf(val) === -1) {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_ENUM', message: field + ' must be one of: ' + spec.values.join(', ') });
                    }
                    break;

                case 'number':
                    if (typeof val !== 'number' || isNaN(val)) {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be a number' });
                    } else {
                        if (spec.exclusiveMin !== undefined && val <= spec.exclusiveMin) {
                            errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be > ' + spec.exclusiveMin });
                        }
                        if (spec.min !== undefined && val < spec.min) {
                            errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be >= ' + spec.min });
                        }
                    }
                    break;

                case 'numberOrBlank':
                    if (val !== '' && (typeof val !== 'number' || isNaN(val))) {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be a number or empty string' });
                    }
                    break;

                case 'boolean':
                    if (val !== true && val !== false && val !== 'TRUE' && val !== 'FALSE' && val !== '') {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be boolean or TRUE/FALSE/empty' });
                    }
                    break;

                case 'string':
                    if (typeof val !== 'string') {
                        errors.push({ table: tableName, row: i, field: field, value: val, code: 'INVALID_TYPE', message: field + ' must be a string' });
                    }
                    break;
            }
        }

        // Check for unexpected fields
        var rowKeys = Object.keys(row);
        for (var k = 0; k < rowKeys.length; k++) {
            if (!fields[rowKeys[k]]) {
                errors.push({ table: tableName, row: i, field: rowKeys[k], value: row[rowKeys[k]], code: 'UNKNOWN_FIELD', message: 'Unexpected field: ' + rowKeys[k] });
            }
        }
    }

    return errors;
}

function checkReferentialIntegrity_(payload) {
    var errors = [];

    // Build lookup sets from existing reference data
    var entities = readTable('Entities');
    var securities = readTable('Securities');

    var ownerIds = {};
    var brokerIds = {};
    var accountIds = {};
    for (var i = 0; i < entities.length; i++) {
        var e = entities[i];
        if (e.EntityType === 'OWNER') ownerIds[e.EntityId] = true;
        if (e.EntityType === 'BROKER') brokerIds[e.EntityId] = true;
        if (e.EntityType === 'ACCOUNT') accountIds[e.EntityId] = true;
    }

    var securityIds = {};
    for (var s = 0; s < securities.length; s++) {
        securityIds[securities[s].SecurityId] = true;
    }

    // Check trades
    var trades = payload.trades || [];
    for (var t = 0; t < trades.length; t++) {
        var tr = trades[t];
        if (tr.OwnerId && !ownerIds[tr.OwnerId])
            errors.push({ table: 'Trades', row: t, field: 'OwnerId', value: tr.OwnerId, code: 'FK_INVALID', message: "OwnerId '" + tr.OwnerId + "' not found in Entities (OWNER)" });
        if (tr.BrokerId && !brokerIds[tr.BrokerId])
            errors.push({ table: 'Trades', row: t, field: 'BrokerId', value: tr.BrokerId, code: 'FK_INVALID', message: "BrokerId '" + tr.BrokerId + "' not found in Entities (BROKER)" });
        if (tr.AccountId && !accountIds[tr.AccountId])
            errors.push({ table: 'Trades', row: t, field: 'AccountId', value: tr.AccountId, code: 'FK_INVALID', message: "AccountId '" + tr.AccountId + "' not found in Entities (ACCOUNT)" });
        if (tr.SecurityId && !securityIds[tr.SecurityId])
            errors.push({ table: 'Trades', row: t, field: 'SecurityId', value: tr.SecurityId, code: 'FK_INVALID', message: "SecurityId '" + tr.SecurityId + "' not found in Securities" });
    }

    // Check cash movements
    var cashMovements = payload.cashMovements || [];
    for (var c = 0; c < cashMovements.length; c++) {
        var cm = cashMovements[c];
        if (cm.OwnerId && !ownerIds[cm.OwnerId])
            errors.push({ table: 'CashMovements', row: c, field: 'OwnerId', value: cm.OwnerId, code: 'FK_INVALID', message: "OwnerId '" + cm.OwnerId + "' not found in Entities (OWNER)" });
        if (cm.AccountId && !accountIds[cm.AccountId])
            errors.push({ table: 'CashMovements', row: c, field: 'AccountId', value: cm.AccountId, code: 'FK_INVALID', message: "AccountId '" + cm.AccountId + "' not found in Entities (ACCOUNT)" });
    }

    // Check lot actions
    var lotActions = payload.lotActions || [];
    for (var a = 0; a < lotActions.length; a++) {
        var la = lotActions[a];
        if (la.SecurityId && !securityIds[la.SecurityId])
            errors.push({ table: 'LotActions', row: a, field: 'SecurityId', value: la.SecurityId, code: 'FK_INVALID', message: "SecurityId '" + la.SecurityId + "' not found in Securities" });
        if (la.SecurityToId && la.SecurityToId !== '' && !securityIds[la.SecurityToId])
            errors.push({ table: 'LotActions', row: a, field: 'SecurityToId', value: la.SecurityToId, code: 'FK_INVALID', message: "SecurityToId '" + la.SecurityToId + "' not found in Securities" });
    }

    return errors;
}

function checkDuplicateIds_(payload) {
    var errors = [];

    // Build sets of existing IDs
    var existingTradeIds = {};
    var existingCashIds = {};
    var existingActionIds = {};

    try {
        var trades = readTable('Trades');
        for (var i = 0; i < trades.length; i++) existingTradeIds[trades[i].TradeId] = true;
    } catch (e) { /* sheet may not exist yet */ }

    try {
        var cash = readTable('CashMovements');
        for (var j = 0; j < cash.length; j++) existingCashIds[cash[j].CashTxnId] = true;
    } catch (e) { /* sheet may not exist yet */ }

    try {
        var actions = readTable('LotActions');
        for (var k = 0; k < actions.length; k++) existingActionIds[actions[k].ActionId] = true;
    } catch (e) { /* sheet may not exist yet */ }

    // Check new trades
    var newTrades = payload.trades || [];
    var batchTradeIds = {};
    for (var t = 0; t < newTrades.length; t++) {
        var tid = newTrades[t].TradeId;
        if (existingTradeIds[tid])
            errors.push({ table: 'Trades', row: t, field: 'TradeId', value: tid, code: 'DUPLICATE_ID', message: "TradeId '" + tid + "' already exists" });
        if (batchTradeIds[tid])
            errors.push({ table: 'Trades', row: t, field: 'TradeId', value: tid, code: 'DUPLICATE_ID', message: "TradeId '" + tid + "' duplicated in batch" });
        batchTradeIds[tid] = true;
    }

    // Check new cash movements
    var newCash = payload.cashMovements || [];
    var batchCashIds = {};
    for (var c = 0; c < newCash.length; c++) {
        var cid = newCash[c].CashTxnId;
        if (existingCashIds[cid])
            errors.push({ table: 'CashMovements', row: c, field: 'CashTxnId', value: cid, code: 'DUPLICATE_ID', message: "CashTxnId '" + cid + "' already exists" });
        if (batchCashIds[cid])
            errors.push({ table: 'CashMovements', row: c, field: 'CashTxnId', value: cid, code: 'DUPLICATE_ID', message: "CashTxnId '" + cid + "' duplicated in batch" });
        batchCashIds[cid] = true;
    }

    // Check new lot actions
    var newActions = payload.lotActions || [];
    var batchActionIds = {};
    for (var a = 0; a < newActions.length; a++) {
        var aid = newActions[a].ActionId;
        if (existingActionIds[aid])
            errors.push({ table: 'LotActions', row: a, field: 'ActionId', value: aid, code: 'DUPLICATE_ID', message: "ActionId '" + aid + "' already exists" });
        if (batchActionIds[aid])
            errors.push({ table: 'LotActions', row: a, field: 'ActionId', value: aid, code: 'DUPLICATE_ID', message: "ActionId '" + aid + "' duplicated in batch" });
        batchActionIds[aid] = true;
    }

    return errors;
}

/* ─── Validation pipeline ─── */

function runValidation_(payload) {
    var errors = [];

    // Check at least one table has data
    var trades = payload.trades || [];
    var cashMovements = payload.cashMovements || [];
    var lotActions = payload.lotActions || [];

    if (trades.length === 0 && cashMovements.length === 0 && lotActions.length === 0) {
        return { status: 'error', errors: [{ code: 'INPUT_PARSE_ERROR', message: 'At least one of trades, cashMovements, or lotActions must be non-empty' }] };
    }

    // Step 1: Schema validation
    if (trades.length > 0)
        errors = errors.concat(validateRows_(trades, 'Trades', TRADE_FIELDS_));
    if (cashMovements.length > 0)
        errors = errors.concat(validateRows_(cashMovements, 'CashMovements', CASH_MOVEMENT_FIELDS_));
    if (lotActions.length > 0)
        errors = errors.concat(validateRows_(lotActions, 'LotActions', LOT_ACTION_FIELDS_));

    // Stop early if schema errors (FK checks would be unreliable)
    if (errors.length > 0) {
        return { status: 'error', errors: errors };
    }

    // Step 2: Referential integrity
    errors = errors.concat(checkReferentialIntegrity_(payload));

    // Step 3: Duplicate IDs
    errors = errors.concat(checkDuplicateIds_(payload));

    if (errors.length > 0) {
        return { status: 'error', errors: errors };
    }

    return { status: 'ok', appended: { trades: trades.length, cashMovements: cashMovements.length, lotActions: lotActions.length } };
}

/* ─── Ingest pipeline ─── */

function runIngest_(payload) {
    // Run validation first
    var validationResult = runValidation_(payload);
    if (validationResult.status === 'error') {
        return validationResult;
    }

    // Append rows to sheets, tracking what was added for rollback
    var appended = [];
    try {
        var tableKeys = ['trades', 'cashMovements', 'lotActions'];
        for (var t = 0; t < tableKeys.length; t++) {
            var key = tableKeys[t];
            var rows = payload[key] || [];
            if (rows.length === 0) continue;

            var def = TABLE_DEFS_[key];
            var result = appendRows_(def.sheetName, rows);
            appended.push({ sheetName: def.sheetName, startRow: result.startRow, count: result.count });
        }

        // Run rebuild
        rebuildAllDerived();

        return {
            status: 'ok',
            appended: {
                trades: (payload.trades || []).length,
                cashMovements: (payload.cashMovements || []).length,
                lotActions: (payload.lotActions || []).length
            },
            rebuild: 'success'
        };

    } catch (err) {
        // Rollback: delete appended rows in reverse order
        for (var r = appended.length - 1; r >= 0; r--) {
            try {
                rollbackAppend_(appended[r].sheetName, appended[r].startRow, appended[r].count);
            } catch (rollbackErr) {
                // Log but don't mask the original error
            }
        }

        return {
            status: 'error',
            errors: [{ code: 'REBUILD_FAILED', message: 'rebuildAllDerived() failed: ' + err.message + '. Appended rows have been rolled back.' }]
        };
    }
}

/* ─── Sheet append/rollback ─── */

function appendRows_(sheetName, rows) {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) throw new Error('Sheet not found: ' + sheetName);

    // Read header row to determine column order
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    // Build value arrays matching header order
    var values = [];
    for (var i = 0; i < rows.length; i++) {
        var rowArr = [];
        for (var h = 0; h < headers.length; h++) {
            var val = rows[i][headers[h]];
            rowArr.push(val !== undefined && val !== null ? val : '');
        }
        values.push(rowArr);
    }

    // Append after last row
    var startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, 1, values.length, headers.length).setValues(values);

    return { startRow: startRow, count: values.length };
}

function rollbackAppend_(sheetName, startRow, count) {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(sheetName);
    if (sh) {
        sh.deleteRows(startRow, count);
    }
}
