const fs = require('fs');
const path = require('path');

/**
 * Converts a CSV file to JSON
 * @param {string} csvFilePath - Path to the CSV file
 * @param {string} jsonFilePath - Path to save the JSON file (optional)
 * @returns {Array} - Array of objects representing CSV rows
 */
function csvToJson(csvFilePath, jsonFilePath = null) {
    // Read the CSV file
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');

    // Split into lines and filter empty lines
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length === 0) {
        console.log('CSV file is empty');
        return [];
    }

    // Parse headers from first line
    const headers = parseCSVLine(lines[0]);

    // Parse data rows
    const jsonData = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};

        headers.forEach((header, index) => {
            let value = values[index] || '';
            // Try to parse numbers and booleans
            value = parseValue(value);
            row[header.trim()] = value;
        });

        jsonData.push(row);
    }

    // Save to JSON file if path provided
    if (jsonFilePath) {
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
        console.log(`Converted ${lines.length - 1} rows to ${jsonFilePath}`);
    }

    return jsonData;
}

/**
 * Parse a CSV line handling quoted fields
 * @param {string} line - CSV line
 * @returns {Array} - Array of field values
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else if (char === '"') {
                // End of quoted field
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                // Start of quoted field
                inQuotes = true;
            } else if (char === ',') {
                // Field separator
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
    }

    // Push the last field
    result.push(current);

    return result;
}

/**
 * Parse string value to appropriate type
 * @param {string} value - String value
 * @returns {*} - Parsed value
 */
function parseValue(value) {
    if (value === '') return '';
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;

    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') {
        return num;
    }

    return value;
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node csv-to-json.js <input.csv> [output.json]');
        console.log('');
        console.log('Examples:');
        console.log('  node csv-to-json.js data.csv');
        console.log('  node csv-to-json.js data.csv data/output.json');
        process.exit(1);
    }

    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace(/\.csv$/i, '.json');

    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }

    const result = csvToJson(inputFile, outputFile);
    console.log(`Successfully converted ${result.length} records`);
}

module.exports = { csvToJson, parseCSVLine, parseValue };
