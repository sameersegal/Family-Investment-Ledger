/**
 * Download Google Spreadsheet data using OAuth and convert to JSON
 * 
 * Setup (one-time):
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a new project (or use existing)
 *   3. Enable the Google Sheets API
 *   4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
 *   5. Choose "Desktop app" as the application type
 *   6. Download the credentials JSON file
 *   7. Save it as "credentials.json" in this folder
 *   8. Run: npm install googleapis
 * 
 * Usage:
 *   node download-sheets.js                          # Download all configured sheets
 *   node download-sheets.js --sheet=Trades           # Download specific sheet
 *   node download-sheets.js --output=./my-data       # Custom output folder
 * 
 * On first run, it will open a browser for you to authorize access.
 * The token is saved to token.json for future use.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const { csvToJson } = require('./csv-to-json');

// ============ CONFIGURATION ============
// Replace with your actual spreadsheet ID (from the URL)
// https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = '1SBl29hJ1FBpb5LvxckBq4AB3s601HK55grreRZPFf2M';

// Sheet names to download (these should match your Google Sheet tab names)
const SHEETS = [
    'Config',
    'Entities',
    'Securities',
    'Trades',
    'LotActions'
];

// Output folders
const CSV_FOLDER = path.join(__dirname, 'csv');
const JSON_FOLDER = path.join(__dirname, 'data');

// OAuth configuration
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// ========================================

/**
 * Get OAuth2 client with valid credentials
 */
async function getAuthClient() {
    // Check for credentials file
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('ERROR: credentials.json not found!');
        console.error('');
        console.error('To set up OAuth credentials:');
        console.error('  1. Go to https://console.cloud.google.com/');
        console.error('  2. Create a project and enable Google Sheets API');
        console.error('  3. Go to Credentials → Create Credentials → OAuth client ID');
        console.error('  4. Choose "Desktop app" as application type');
        console.error('  5. Download and save as "credentials.json" in this folder');
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have a saved token
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);

        // Check if token is expired and refresh if needed
        if (token.expiry_date && token.expiry_date < Date.now()) {
            console.log('Token expired, refreshing...');
            try {
                const { credentials: newCredentials } = await oAuth2Client.refreshAccessToken();
                oAuth2Client.setCredentials(newCredentials);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(newCredentials, null, 2));
                console.log('Token refreshed successfully');
            } catch (err) {
                console.log('Failed to refresh token, need to re-authorize');
                return await getNewToken(oAuth2Client);
            }
        }

        return oAuth2Client;
    }

    // No token, need to authorize
    return await getNewToken(oAuth2Client);
}

/**
 * Get new token via OAuth flow
 */
async function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('');
    console.log('=== Authorization Required ===');
    console.log('');
    console.log('1. Open this URL in your browser:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log('2. Authorize the application');
    console.log('3. Copy the authorization code and paste it below');
    console.log('');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        rl.question('Enter the authorization code: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code.trim());
                oAuth2Client.setCredentials(tokens);

                // Save token for future use
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
                console.log('');
                console.log('Token saved to', TOKEN_PATH);
                console.log('');

                resolve(oAuth2Client);
            } catch (err) {
                reject(new Error('Error getting token: ' + err.message));
            }
        });
    });
}

/**
 * Download a sheet's data using Google Sheets API
 * @param {google.auth.OAuth2} auth - Authenticated OAuth2 client
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} sheetName - The sheet name
 * @returns {Promise<Array<Array>>} - 2D array of cell values
 */
async function downloadSheetData(auth, spreadsheetId, sheetName) {
    const sheets = google.sheets({ version: 'v4', auth });

    console.log(`Downloading: ${sheetName}...`);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetName,
    });

    return response.data.values || [];
}

/**
 * Convert 2D array to CSV string
 */
function arrayToCSV(data) {
    return data.map(row =>
        row.map(cell => {
            const value = cell === null || cell === undefined ? '' : String(cell);
            // Quote if contains comma, quote, or newline
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        }).join(',')
    ).join('\n');
}

/**
 * Convert 2D array directly to JSON (skip CSV intermediate step)
 */
function arrayToJSON(data) {
    if (data.length === 0) return [];

    const headers = data[0];
    const rows = data.slice(1);

    return rows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            let value = row[i];
            if (value === undefined || value === null) {
                value = '';
            }
            // Try to parse numbers and booleans
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (value === 'null') value = null;
            else if (value !== '' && !isNaN(Number(value))) {
                value = Number(value);
            }
            obj[header] = value;
        });
        return obj;
    });
}

/**
 * Save CSV content to file
 */
function saveCSV(sheetName, content, outputFolder) {
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    const filePath = path.join(outputFolder, `${sheetName}.csv`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  Saved CSV: ${filePath}`);
    return filePath;
}

/**
 * Save JSON content to file
 */
function saveJSON(sheetName, data, outputFolder) {
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    const filePath = path.join(outputFolder, `${sheetName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`  Saved JSON: ${filePath} (${data.length} rows)`);
    return filePath;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        sheets: [...SHEETS],
        csvOnly: false,
        jsonOnly: false,
        csvFolder: CSV_FOLDER,
        jsonFolder: JSON_FOLDER,
        spreadsheetId: SPREADSHEET_ID
    };

    for (const arg of args) {
        if (arg === '--csv-only') {
            options.csvOnly = true;
        } else if (arg === '--json-only') {
            options.jsonOnly = true;
        } else if (arg.startsWith('--sheet=')) {
            options.sheets = [arg.substring('--sheet='.length)];
        } else if (arg.startsWith('--sheets=')) {
            options.sheets = arg.substring('--sheets='.length).split(',');
        } else if (arg.startsWith('--output=')) {
            const outputPath = arg.substring('--output='.length);
            options.jsonFolder = path.isAbsolute(outputPath) ? outputPath : path.join(__dirname, outputPath);
        } else if (arg.startsWith('--csv-output=')) {
            const csvPath = arg.substring('--csv-output='.length);
            options.csvFolder = path.isAbsolute(csvPath) ? csvPath : path.join(__dirname, csvPath);
        } else if (arg.startsWith('--id=')) {
            options.spreadsheetId = arg.substring('--id='.length);
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Google Sheets Downloader with OAuth

Usage: node download-sheets.js [options]

Options:
  --id=SPREADSHEET_ID    Google Spreadsheet ID (from URL)
  --sheet=NAME           Download only this sheet
  --sheets=A,B,C         Download multiple specific sheets (comma-separated)
  --csv-only             Save only CSV files
  --json-only            Save only JSON files (default saves both)
  --output=PATH          Output folder for JSON files (default: ./data)
  --csv-output=PATH      Output folder for CSV files (default: ./csv)
  --help, -h             Show this help message

Setup:
  1. Create OAuth credentials at https://console.cloud.google.com/
  2. Enable Google Sheets API
  3. Create OAuth client ID (Desktop app)
  4. Download and save as credentials.json

Example:
  node download-sheets.js --id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
  node download-sheets.js --id=YOUR_ID --sheet=Trades --json-only
`);
            process.exit(0);
        }
    }

    return options;
}

/**
 * Main function
 */
async function main() {
    const options = parseArgs();

    if (options.spreadsheetId === 'YOUR_SPREADSHEET_ID_HERE') {
        console.error('ERROR: Please set your SPREADSHEET_ID in the script or use --id=YOUR_ID');
        console.error('');
        console.error('To find your spreadsheet ID:');
        console.error('  1. Open your Google Spreadsheet');
        console.error('  2. Look at the URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit');
        console.error('  3. Copy the SPREADSHEET_ID part');
        process.exit(1);
    }

    console.log('=== Google Sheets Downloader (OAuth) ===\n');

    // Authenticate
    const auth = await getAuthClient();
    console.log('Authenticated successfully!\n');

    console.log(`Spreadsheet ID: ${options.spreadsheetId}`);
    console.log(`Sheets to download: ${options.sheets.join(', ')}`);
    if (!options.jsonOnly) {
        console.log(`CSV output: ${options.csvFolder}`);
    }
    if (!options.csvOnly) {
        console.log(`JSON output: ${options.jsonFolder}`);
    }
    console.log('');

    const results = {
        success: [],
        failed: []
    };

    for (const sheetName of options.sheets) {
        try {
            // Download sheet data
            const data = await downloadSheetData(auth, options.spreadsheetId, sheetName);

            if (data.length === 0) {
                console.log(`  Warning: ${sheetName} is empty`);
                continue;
            }

            // Save CSV
            if (!options.jsonOnly) {
                const csvContent = arrayToCSV(data);
                saveCSV(sheetName, csvContent, options.csvFolder);
            }

            // Save JSON
            if (!options.csvOnly) {
                const jsonData = arrayToJSON(data);
                saveJSON(sheetName, jsonData, options.jsonFolder);
            }

            results.success.push(sheetName);
        } catch (error) {
            console.error(`  ERROR: ${error.message}`);
            results.failed.push({ sheet: sheetName, error: error.message });
        }
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log(`Success: ${results.success.length} sheets`);
    if (results.failed.length > 0) {
        console.log(`Failed: ${results.failed.length} sheets`);
        results.failed.forEach(f => console.log(`  - ${f.sheet}: ${f.error}`));
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err.message);
        process.exit(1);
    });
}

module.exports = { getAuthClient, downloadSheetData, arrayToCSV, arrayToJSON };
