/**
 * Verification script for Sensitivity_Data.json
 * Compares lots data from Lots_Current.json with Sensitivity_Data.json
 * to verify the data is being correctly transformed.
 * 
 * Focus stocks: AAPL, MELI (HDFC/HDFCBANK, NYKAA are not in the real data)
 */

const fs = require('fs');
const path = require('path');

// Load real data
const dataDir = path.join(__dirname, '..', 'data');
const lotsCurrentPath = path.join(dataDir, 'Lots_Current.json');
const sensitivityDataPath = path.join(dataDir, 'Sensitivity_Data.json');
const securitiesPath = path.join(dataDir, 'Securities.json');
const configPath = path.join(dataDir, 'Config.json');

const lotsCurrent = JSON.parse(fs.readFileSync(lotsCurrentPath, 'utf8'));
const sensitivityData = JSON.parse(fs.readFileSync(sensitivityDataPath, 'utf8'));
const securities = JSON.parse(fs.readFileSync(securitiesPath, 'utf8'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Today's date for calculation (Sensitivity_Data was generated on 2026-01-04)
const today = new Date('2026-01-07'); // Current date as per context

// Build lookup maps
const secMap = Object.fromEntries(securities.map(s => [s.SecurityId, s]));
const taxMap = Object.fromEntries(config.map(c => [c.AssetClass, c]));

// Focus tickers
const FOCUS_TICKERS = ['AAPL', 'MELI', 'HDFCBANK', 'NYKAA'];

// Helper function to calculate days between dates
function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = d2 - d1;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Parse tax rate string to number
function parseTaxRate(rateStr) {
    if (!rateStr) return 0;
    if (rateStr === 'SLAB') return 0.30; // Assume highest slab
    const match = rateStr.match(/([\d.]+)%/);
    return match ? parseFloat(match[1]) / 100 : 0;
}

console.log('='.repeat(80));
console.log('SENSITIVITY DATA VERIFICATION');
console.log('='.repeat(80));
console.log(`\nGenerated Date: ${sensitivityData[0].meta.split('DATE: ')[1].split(' |')[0]}`);
console.log(`Verification Date: ${today.toISOString().split('T')[0]}`);
console.log(`\nFocus Tickers: ${FOCUS_TICKERS.join(', ')}\n`);

// Extract lots from Sensitivity_Data
const sensitivityLots = sensitivityData[0].lots;

// Filter lots for focus tickers
const focusLotsFromCurrent = lotsCurrent.filter(l => {
    const sec = secMap[l.SecurityId] || {};
    const ticker = sec.Ticker || l.SecurityId;
    return FOCUS_TICKERS.includes(ticker) && l.OpenQty > 0;
});

const focusLotsFromSensitivity = sensitivityLots.filter(l =>
    FOCUS_TICKERS.includes(l.Ticker)
);

console.log('='.repeat(80));
console.log('DATA SUMMARY');
console.log('='.repeat(80));

for (const ticker of FOCUS_TICKERS) {
    const currentLots = focusLotsFromCurrent.filter(l => {
        const sec = secMap[l.SecurityId] || {};
        return (sec.Ticker || l.SecurityId) === ticker;
    });

    const sensitLots = focusLotsFromSensitivity.filter(l => l.Ticker === ticker);

    console.log(`\n${ticker}:`);
    console.log(`  Lots in Lots_Current: ${currentLots.length}`);
    console.log(`  Lots in Sensitivity_Data: ${sensitLots.length}`);

    // Total quantity
    const totalQtyCurrent = currentLots.reduce((sum, l) => sum + l.OpenQty, 0);
    const totalQtySensit = sensitLots.reduce((sum, l) => sum + l.Qty, 0);
    console.log(`  Total Qty (Current): ${totalQtyCurrent}`);
    console.log(`  Total Qty (Sensitivity): ${totalQtySensit}`);
    console.log(`  Qty Match: ${totalQtyCurrent === totalQtySensit ? '✅' : '❌'}`);

    // Total cost
    const totalCostCurrent = Math.round(currentLots.reduce((sum, l) => sum + l.CostINR, 0));
    const totalCostSensit = sensitLots.reduce((sum, l) => sum + l.CostINR, 0);
    console.log(`  Total CostINR (Current): ${totalCostCurrent.toLocaleString()}`);
    console.log(`  Total CostINR (Sensitivity): ${totalCostSensit.toLocaleString()}`);
    console.log(`  Cost Match: ${Math.abs(totalCostCurrent - totalCostSensit) < 100 ? '✅' : '❌'} (diff: ${totalCostCurrent - totalCostSensit})`);
}

console.log('\n' + '='.repeat(80));
console.log('DETAILED LOT-BY-LOT VERIFICATION');
console.log('='.repeat(80));

let totalIssues = 0;

for (const ticker of FOCUS_TICKERS) {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`${ticker} - Detailed Comparison`);
    console.log(`${'─'.repeat(40)}`);

    // Get lots from current (sorted by owner, then buy date)
    const currentLots = focusLotsFromCurrent.filter(l => {
        const sec = secMap[l.SecurityId] || {};
        return (sec.Ticker || l.SecurityId) === ticker;
    }).sort((a, b) => {
        if (a.OwnerId !== b.OwnerId) return a.OwnerId.localeCompare(b.OwnerId);
        return new Date(a.BuyDate) - new Date(b.BuyDate);
    });

    // Get lots from sensitivity (already sorted by owner, then ticker, then buy date)
    const sensitLots = focusLotsFromSensitivity.filter(l => l.Ticker === ticker);

    // Compare each lot
    for (let i = 0; i < currentLots.length; i++) {
        const current = currentLots[i];
        const sensit = sensitLots[i];
        const sec = secMap[current.SecurityId] || {};
        const rule = taxMap[sec.AssetClass] || {};

        // Calculate expected values
        const buyDate = new Date(current.BuyDate);
        const holdingDays = daysBetween(buyDate, today);
        const ltDays = Number(rule.HoldingPeriod_LT_Days) || 365;
        const gainType = holdingDays >= ltDays ? 'LTCG' : 'STCG';
        const daysToLTCG = gainType === 'LTCG' ? 0 : ltDays - holdingDays;
        const expectedType = gainType === 'LTCG' ? 'L' : 'S';
        const expectedToLTCG = daysToLTCG > 0 ? daysToLTCG : '';
        const expectedCostINR = Math.round(current.CostINR);

        console.log(`\n  Lot ${i + 1}: ${current.LotId} (Buy: ${current.BuyDate})`);
        console.log(`    Owner: ${current.OwnerId}`);
        console.log(`    Qty: ${current.OpenQty} → ${sensit ? sensit.Qty : 'MISSING'} ${current.OpenQty === (sensit?.Qty) ? '✅' : '❌'}`);
        console.log(`    CostINR: ${expectedCostINR.toLocaleString()} → ${sensit ? sensit.CostINR.toLocaleString() : 'MISSING'} ${expectedCostINR === (sensit?.CostINR) ? '✅' : '❌'}`);
        console.log(`    Type: ${expectedType} → ${sensit ? sensit.Type : 'MISSING'} ${expectedType === (sensit?.Type) ? '✅' : '❌'}`);
        console.log(`    Holding Days: ${holdingDays} | LT Threshold: ${ltDays} days`);

        if (expectedType === 'S') {
            console.log(`    ToLTCG: ${expectedToLTCG} → ${sensit ? sensit.ToLTCG : 'MISSING'} ${expectedToLTCG === (sensit?.ToLTCG) ? '✅' : '❌'}`);
        }

        // Check for issues
        if (!sensit) {
            console.log(`    ⚠️  MISSING in Sensitivity_Data`);
            totalIssues++;
        } else if (current.OpenQty !== sensit.Qty) {
            console.log(`    ⚠️  Qty mismatch`);
            totalIssues++;
        } else if (expectedCostINR !== sensit.CostINR) {
            console.log(`    ⚠️  CostINR mismatch (diff: ${expectedCostINR - sensit.CostINR})`);
            totalIssues++;
        } else if (expectedType !== sensit.Type) {
            console.log(`    ⚠️  Type mismatch`);
            totalIssues++;
        }
    }
}

console.log('\n' + '='.repeat(80));
console.log('TAX CALCULATION VERIFICATION');
console.log('='.repeat(80));

for (const ticker of FOCUS_TICKERS) {
    const sec = securities.find(s => s.Ticker === ticker);
    if (!sec) continue;

    const rule = taxMap[sec.AssetClass] || {};

    console.log(`\n${ticker} (${sec.AssetClass}):`);
    console.log(`  LT Holding Period: ${rule.HoldingPeriod_LT_Days} days`);
    console.log(`  LTCG Tax Rate: ${rule.LTCG_Tax_Rate}`);
    console.log(`  STCG Tax Rate: ${rule.STCG_Tax_Rate}`);
    console.log(`  LTCG Exemption: ₹${rule.LTCG_Exemption_INR?.toLocaleString() || 0}`);
}

console.log('\n' + '='.repeat(80));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(80));

if (totalIssues === 0) {
    console.log('\n✅ All lots verified successfully!');
} else {
    console.log(`\n❌ Found ${totalIssues} issues that need attention.`);
}

// Check for missing tickers
console.log('\n' + '='.repeat(80));
console.log('MISSING TICKERS (Not in real data)');
console.log('='.repeat(80));
console.log('\nThe following requested tickers are NOT present in the real data:');
console.log('  - HDFC/HDFCBANK: Not found in Lots_Current.json');
console.log('  - NYKAA: Not found in Lots_Current.json');
console.log('\nThese tickers exist only in test data (tests/data/)');

// Check what tickers are available
const allTickers = [...new Set(lotsCurrent.map(l => {
    const sec = secMap[l.SecurityId] || {};
    return sec.Ticker || l.SecurityId;
}))].sort();

console.log('\nAvailable tickers in real data:');
console.log(`  ${allTickers.join(', ')}`);
