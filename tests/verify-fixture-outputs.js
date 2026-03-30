const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const fixtureDir = path.join(__dirname, 'data');
const expectedDir = fixtureDir;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-ledger-fixture-'));

const OUTPUT_FILES = [
    'Lots_Current.json',
    'LotConsumes.json',
    'Gains_Realized.json',
    'Tax_Summary_FY.json',
    'XIRR_Cashflows.json',
    'Cash_Balances.json',
    'RBI_180_Ageing.json',
    'QC_Equity_By_Account.json',
    'Sensitivity_Data.json',
    'Sensitivity_Summary.json',
    'Bonds_Current.json'
];

function copyFixtureData() {
    fs.cpSync(fixtureDir, tempDir, { recursive: true });
}

function runRebuild(dataFolder) {
    const context = {
        console,
        require,
        __dirname: repoRoot,
        Date,
        Object,
        Array,
        Number,
        String,
        Math,
        JSON,
        Error,
        isNaN
    };

    vm.createContext(context);

    const helpersCode = fs.readFileSync(path.join(repoRoot, 'Helpers.js'), 'utf8');
    vm.runInContext(helpersCode, context);

    context.IS_LOCAL = true;
    context.DATA_FOLDER = dataFolder;

    const codeCode = fs.readFileSync(path.join(repoRoot, 'Code.js'), 'utf8');
    vm.runInContext(codeCode, context);
    vm.runInContext('rebuildAllDerived()', context);
}

function normalize(value, fileName) {
    if (Array.isArray(value)) {
        return value.map(item => normalize(item, fileName));
    }

    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                acc[key] = normalize(value[key], fileName);
                return acc;
            }, {});
    }

    if (fileName === 'Sensitivity_Data.json' && typeof value === 'string') {
        return value.replace(/DATE: \d{4}-\d{2}-\d{2}/, 'DATE: <normalized>');
    }

    return value;
}

function compareOutputs() {
    const mismatches = [];

    OUTPUT_FILES.forEach(fileName => {
        const actual = JSON.parse(fs.readFileSync(path.join(tempDir, fileName), 'utf8'));
        const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, fileName), 'utf8'));

        try {
            assert.deepStrictEqual(normalize(actual, fileName), normalize(expected, fileName));
        } catch (error) {
            mismatches.push({ fileName, error });
        }
    });

    if (mismatches.length > 0) {
        mismatches.forEach(({ fileName, error }) => {
            console.error(`Mismatch in ${fileName}`);
            console.error(error.message);
        });
        throw new Error(`Fixture regression check failed for ${mismatches.length} file(s)`);
    }

    console.log('✓ Fixture regression outputs match expected files');
}

try {
    copyFixtureData();
    runRebuild(tempDir);
    compareOutputs();
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}