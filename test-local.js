/**
 * Local Test Runner for neo-ledger
 * 
 * Run this file with Node.js to test the ledger logic locally.
 * Make sure you have sample data JSON files in the data/ folder.
 * 
 * Usage:
 *   node test-local.js
 */

// For Node.js compatibility, we need to load files differently
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    // IS_LOCAL will be set by Helpers.js
};

// Make context properties accessible as globals
vm.createContext(context);

// Load Helpers.js first
const helpersCode = fs.readFileSync(path.join(__dirname, 'Helpers.js'), 'utf8');
vm.runInContext(helpersCode, context);

// Enable local mode
context.IS_LOCAL = true;

// Load Code.js
const codeCode = fs.readFileSync(path.join(__dirname, 'Code.js'), 'utf8');
vm.runInContext(codeCode, context);

console.log('=== Neo Ledger Local Test ===\n');
console.log('IS_LOCAL:', context.IS_LOCAL);
console.log('');

// Run the main rebuild function
try {
    console.log('Running rebuildAllDerived()...\n');
    vm.runInContext('rebuildAllDerived()', context); console.log('\n=== Complete ===');
} catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
}