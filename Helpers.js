/**** Configuration ****/

/**
 * Set to true for local testing (reads/writes JSON files in data/ folder)
 * Set to false for production (uses Google Sheets)
 */
var IS_LOCAL = false;

/**** Helpers ****/

function getSheet(name) {
    if (IS_LOCAL) {
        throw new Error("getSheet() is not available in local mode. Use readTable/writeTable instead.");
    }
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error("Missing sheet: " + name);
    return sh;
}

function resetSheet(name) {
    if (IS_LOCAL) {
        // In local mode, just return a mock object that tracks data
        return {
            _name: name,
            _data: [],
            _formulas: {},
            clear: function () { this._data = []; this._formulas = {}; },
            getRange: function (row, col, numRows, numCols) {
                const self = this;
                return {
                    setValues: function (values) {
                        for (let r = 0; r < values.length; r++) {
                            const rowIdx = row + r - 1;
                            if (!self._data[rowIdx]) self._data[rowIdx] = [];
                            for (let c = 0; c < values[r].length; c++) {
                                self._data[rowIdx][col + c - 1] = values[r][c];
                            }
                        }
                    },
                    setFormula: function (formula) {
                        self._formulas[`${row},${col}`] = formula;
                    },
                    setFormulaR1C1: function (formula) {
                        for (let r = 0; r < (numRows || 1); r++) {
                            self._formulas[`${row + r},${col}`] = formula;
                        }
                    },
                    clearContent: function () { }
                };
            },
            getLastRow: function () { return this._data.length; },
            getName: function () { return this._name; }
        };
    }
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    return sh;
}

function readTable(name) {
    if (IS_LOCAL) {
        return readTableLocal_(name);
    }
    const sh = getSheet(name);
    const values = sh.getDataRange().getValues();
    const headers = values.shift();
    return values.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function writeTable(name, rows) {
    if (IS_LOCAL) {
        writeTableLocal_(name, rows);
        return;
    }
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();

    if (rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(2, 1, rows.length, headers.length)
        .setValues(rows.map(r => headers.map(h => r[h])));
}

function colIndexByHeader(sheet, headerName, startColumn) {
    startColumn = startColumn || 1;
    if (IS_LOCAL) {
        // In local mode, sheet is a mock object with _data
        const headers = sheet._data[startColumn - 1] || [];
        const idx = headers.indexOf(headerName);
        if (idx === -1) throw new Error(`Header '${headerName}' not found in sheet '${sheet._name}'`);
        return idx + 1;
    }
    const headers = sheet.getRange(startColumn, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = headers.indexOf(headerName);
    if (idx === -1) throw new Error(`Header '${headerName}' not found in sheet '${sheet.getName()}'`);
    return idx + 1; // 1-based
}

function clearColumnRange(sheet, col, fromRow) {
    if (IS_LOCAL) {
        // In local mode, no-op or clear mock data
        return;
    }
    const lastRow = Math.max(sheet.getLastRow(), fromRow);
    if (lastRow >= fromRow) {
        sheet.getRange(fromRow, col, lastRow - fromRow + 1, 1).clearContent();
    }
}

function fyFromDate(d) {
    const dt = new Date(d);
    const y = dt.getFullYear();
    return (dt.getMonth() >= 3) ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function daysBetween(a, b) {
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// Helper: convert column index to A1 letter
function columnLetter_(col) {
    let temp = col;
    let letter = "";
    while (temp > 0) {
        let rem = (temp - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        temp = Math.floor((temp - 1) / 26);
    }
    return letter;
}

/**** Local File System Helpers (Node.js compatible) ****/

/**
 * Read table from local JSON file
 * @param {string} name - Table name (used as filename)
 * @returns {Array<Object>} Array of row objects
 */
function readTableLocal_(name) {
    // For Node.js / local testing
    if (typeof require !== 'undefined') {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, 'data', name + '.json');

        if (!fs.existsSync(filePath)) {
            console.warn(`Local file not found: ${filePath}, returning empty array`);
            return [];
        }

        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    }

    // Fallback for Apps Script environment (should not reach here if IS_LOCAL is properly set)
    throw new Error("Local mode requires Node.js environment");
}

/**
 * Write table to local JSON file
 * @param {string} name - Table name (used as filename)
 * @param {Array<Object>} rows - Array of row objects to write
 */
function writeTableLocal_(name, rows) {
    // For Node.js / local testing
    if (typeof require !== 'undefined') {
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(__dirname, 'data');

        // Ensure data directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const filePath = path.join(dataDir, name + '.json');
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
        console.log(`Written ${rows.length} rows to ${filePath}`);
    } else {
        throw new Error("Local mode requires Node.js environment");
    }
}

/**
 * Set IS_LOCAL flag programmatically
 * @param {boolean} value - true for local mode, false for Sheets mode
 */
function setLocalMode(value) {
    IS_LOCAL = value;
}
