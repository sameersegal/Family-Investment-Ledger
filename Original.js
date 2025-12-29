/**** Helpers ****/

function getSheet(name) {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error("Missing sheet: " + name);
    return sh;
}

function resetSheet(name) {
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    return sh;
}

function readTable(name) {
    const sh = getSheet(name);
    const values = sh.getDataRange().getValues();
    const headers = values.shift();
    return values.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function writeTable(name, rows) {
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

function colIndexByHeader(sheet, headerName, startColumn = 1) {
    const headers = sheet.getRange(startColumn, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = headers.indexOf(headerName);
    if (idx === -1) throw new Error(`Header '${headerName}' not found in sheet '${sheet.getName()}'`);
    return idx + 1; // 1-based
}

function clearColumnRange(sheet, col, fromRow) {
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

/**** Rebuild Lots ****/
/**** address partial sales, splits, transfers, gifts ****/
function rebuildLots() {
    const trades = readTable("Trades");
    const actions = readTable("LotActions");

    let lots = [];
    let consumes = [];
    let lotSeq = 1;
    let consumeSeq = 1;

    const secs = Object.fromEntries(
        readTable("Securities").map(s => [s.SecurityId, s])
    );

    function openLots(owner, assetId) {
        return lots
            .filter(l => l.OwnerId === owner && l.AssetId === assetId && l.OpenQty > 0)
            .sort((a, b) => new Date(a.BuyDate) - new Date(b.BuyDate));
    }

    const events = [];

    trades.forEach(t => events.push({
        Type: t.Side,
        Date: new Date(t.TradeDate),
        Data: t
    }));

    actions.forEach(a => events.push({
        Type: a.ActionType,
        Date: new Date(a.ActionDate),
        Data: a
    }));

    const order = { BUY: 1, SPLIT: 2, SELL: 3, GIFT: 4, TRANSFER: 5 };
    events.sort((a, b) => a.Date - b.Date || order[a.Type] - order[b.Type]);

    events.forEach(e => {
        const d = e.Data;

        // BUY
        if (e.Type === "BUY") {
            const qty = Number(d.Quantity);
            const price = Number(d.Price);
            const fx = Number(d.FXRateToINR);
            const assetId = secs[d.SecurityId].AssetId;

            lots.push({
                LotId: "LOT_" + lotSeq++,
                OwnerId: d.OwnerId,
                SecurityId: d.SecurityId,
                AssetId: assetId,
                BuyDate: d.TradeDate,
                OpenQty: qty,
                CostNative: qty * price,          // aggregate
                CostPriceNative: price,            // per share
                CostINR: qty * price * fx,
                BuyFXRate: fx,
                BrokerId: d.BrokerId,
                AccountId: d.AccountId
            });
        }

        // CLASS_REORG (Alphabet 2014: create GOOG from GOOGL)
        if (e.Type === "CLASS_REORG") {
            const fromSec = d.SecurityId;          // GOOGL
            const assetId = secs[fromSec].AssetId;

            // Find all open GOOGL lots for this asset
            const sourceLots = lots.filter(l =>
                l.AssetId === assetId &&
                l.SecurityId === fromSec &&
                l.OpenQty > 0
            );

            sourceLots.forEach(lot => {
                // Split cost 50/50 (total cost unchanged)
                const newCostNative = lot.CostNative * 0.5;
                const newCostINR = lot.CostINR * 0.5;

                // Create GOOG lot with same quantity
                lots.push({
                    LotId: "LOT_" + lotSeq++,
                    OwnerId: lot.OwnerId,
                    SecurityId: "GOOG",
                    AssetId: assetId,
                    BuyDate: lot.BuyDate,
                    OpenQty: lot.OpenQty,
                    CostNative: newCostNative,
                    CostPriceNative: lot.CostPriceNative * 0.5,
                    CostINR: newCostINR,
                    BuyFXRate: lot.BuyFXRate,
                    BrokerId: lot.BrokerId,
                    AccountId: lot.AccountId
                });

                // Reduce original GOOGL lot cost by half
                lot.CostNative = newCostNative;
                lot.CostINR = newCostINR;
                lot.CostPriceNative *= 0.5;
            });
        }

        // SELL (FIFO)
        if (e.Type === "SELL") {
            let qty = Number(d.Quantity);
            const salePrice = Number(d.Price);
            const saleFX = Number(d.FXRateToINR);
            const assetId = secs[d.SecurityId].AssetId;

            for (const lot of openLots(d.OwnerId, assetId)) {
                if (qty <= 0) break;

                const used = Math.min(lot.OpenQty, qty);
                const frac = used / lot.OpenQty;

                const costNativeUsed = lot.CostNative * frac;
                const costINRUsed = lot.CostINR * frac;

                const proceedsNative = used * salePrice;
                const proceedsINR = proceedsNative * saleFX;

                consumes.push({
                    ConsumeId: "C_" + consumeSeq++,
                    TradeId: d.TradeId,
                    OwnerId: d.OwnerId,
                    SecurityId: d.SecurityId,
                    AssetId: assetId,
                    LotId: lot.LotId,
                    BuyDate: lot.BuyDate,
                    SellDate: d.TradeDate,
                    Quantity: used,

                    CostNative: costNativeUsed,          // aggregate
                    CostPriceNative: lot.CostPriceNative, // per share
                    CostINR: costINRUsed,
                    CostFXRate: lot.BuyFXRate ?? null,

                    SalePriceNative: salePrice,           // per share
                    SaleFXRate: saleFX,
                    ProceedsNative: proceedsNative,       // aggregate
                    ProceedsINR: proceedsINR
                });

                lot.OpenQty -= used;
                lot.CostNative -= costNativeUsed;
                lot.CostINR -= costINRUsed;
                // CostPriceNative remains unchanged
                qty -= used;
            }
        }

        // SPLIT (quantity changes, total cost unchanged)
        if (e.Type === "SPLIT") {
            const factor = Number(d.SplitNumerator) / Number(d.SplitDenominator);
            lots.forEach(l => {
                if (l.SecurityId === d.SecurityId && l.OpenQty > 0) {
                    l.OpenQty *= factor;
                    l.CostPriceNative /= factor; // per-share price adjusts
                }
            });
        }

        // GIFT
        if (e.Type === "GIFT") {
            let qty = Number(d.Quantity);
            const assetId = secs[d.SecurityId].AssetId;

            for (const lot of openLots(d.OwnerFromId, assetId)) {
                if (qty <= 0) break;

                const move = Math.min(lot.OpenQty, qty);
                const frac = move / lot.OpenQty;

                const costNativeMove = lot.CostNative * frac;
                const costINRMove = lot.CostINR * frac;

                lots.push({
                    LotId: "LOT_" + lotSeq++,
                    OwnerId: d.OwnerToId,
                    SecurityId: lot.SecurityId,
                    AssetId: assetId,
                    BuyDate: lot.BuyDate,
                    OpenQty: move,
                    CostNative: costNativeMove,
                    CostPriceNative: lot.CostPriceNative,
                    CostINR: costINRMove,
                    BuyFXRate: lot.BuyFXRate ?? null,
                    BrokerId: lot.BrokerId,
                    AccountId: lot.AccountId
                });

                lot.OpenQty -= move;
                lot.CostNative -= costNativeMove;
                lot.CostINR -= costINRMove;
                qty -= move;
            }
        }

        // TRANSFER (no cost impact)
        if (e.Type === "TRANSFER") {
            let qty = Number(d.Quantity);
            const assetId = secs[d.SecurityId].AssetId;

            for (const lot of openLots(d.OwnerFromId, assetId)) {
                if (qty <= 0) break;
                const move = Math.min(lot.OpenQty, qty);
                lot.BrokerId = d.BrokerToId;
                lot.AccountId = d.AccountToId;
                qty -= move;
            }
        }
    });

    writeTable("Lots_Current", lots.filter(l => l.OpenQty > 0));
    writeTable("LotConsumes", consumes);
}



/**** Create Cashflow for XIRR ****/
function rebuildXIRRCashflows() {
    const sh = resetSheet("XIRR_Cashflows");

    // Headers
    sh.getRange(1, 1, 1, 9).setValues([[
        "Portfolio",
        "OwnerId",
        "SecurityId",
        "AssetId",
        "Symbol",
        "Quantity",
        "FlowDate",
        "CashFlow",
        "FlowType"
    ]]);

    const trades = readTable("Trades");
    const lots = readTable("Lots_Current");
    const secsArr = readTable("Securities");
    const secs = Object.fromEntries(secsArr.map(s => [s.SecurityId, s]));

    /* -----------------------------
       1) Aggregate OPEN quantity by AssetId
       ----------------------------- */
    const qtyByAsset = {};
    const repSecByAsset = {}; // representative security per asset

    lots.forEach(l => {
        const q = Number(l.OpenQty);
        if (!q || q <= 0) return;

        qtyByAsset[l.AssetId] = (qtyByAsset[l.AssetId] || 0) + q;

        // pick first seen security as representative (stable & simple)
        if (!repSecByAsset[l.AssetId]) {
            repSecByAsset[l.AssetId] = l.SecurityId;
        }
    });

    const rows = [];

    /* -----------------------------
       2) BUY / SELL cashflows (execution-level)
       ----------------------------- */
    trades.forEach(t => {
        const sec = secs[t.SecurityId];
        if (!sec) return;

        const portfolio = (sec.Country === "India") ? "India" : "US";
        const amt = Number(t.Quantity) * Number(t.Price);
        const cashflow = (t.Side === "BUY") ? -amt : amt;

        rows.push([
            portfolio,                 // A
            t.OwnerId,                 // B
            t.SecurityId,              // C
            sec.AssetId,               // D
            sec.Ticker,                // E
            "",                        // F Quantity (not needed)
            new Date(t.TradeDate),     // G
            cashflow,                  // H
            t.Side                     // I
        ]);
    });

    /* -----------------------------
       3) CURRENT_VALUE (ONE per AssetId)
       ----------------------------- */
    Object.entries(qtyByAsset).forEach(([assetId, qty]) => {
        const repSecId = repSecByAsset[assetId];
        const sec = secs[repSecId];
        if (!sec) return;

        const portfolio = (sec.Country === "India") ? "India" : "US";

        rows.push([
            portfolio,   // A
            "",          // B owner-neutral
            repSecId,    // C representative SecurityId
            assetId,     // D AssetId
            sec.Ticker,  // E symbol used for pricing
            qty,         // F quantity
            "",          // G FlowDate (formula)
            "",          // H CashFlow (formula)
            "CURRENT_VALUE"
        ]);
    });

    if (rows.length === 0) return;

    sh.getRange(2, 1, rows.length, 9).setValues(rows);

    /* -----------------------------
       4) Formulas ONLY for CURRENT_VALUE rows
       ----------------------------- */
    const startRow = 2;
    for (let i = 0; i < rows.length; i++) {
        const rowNum = startRow + i;
        const flowType = rows[i][8]; // I

        if (flowType === "CURRENT_VALUE") {
            // FlowDate (G)
            sh.getRange(rowNum, 7).setFormula(`TODAY()`);

            // CashFlow (H) = Quantity * GOOGLEFINANCE(Symbol)
            sh.getRange(rowNum, 8).setFormula(
                `$F${rowNum} * GOOGLEFINANCE($E${rowNum})`
            );
        }
    }
}

/**** Compute Realized Gain ****/
/**** core FIFO logic ****/
function computeRealizedGains() {
    const consumes = readTable("LotConsumes");
    const secs = Object.fromEntries(
        readTable("Securities").map(s => [s.SecurityId, s])
    );
    const tax = Object.fromEntries(
        readTable("Config").map(t => [t.AssetClass, t])
    );

    const gains = consumes.map(c => {
        const buy = new Date(c.BuyDate);
        const sell = new Date(c.SellDate);
        const holding = daysBetween(buy, sell);
        const asset = secs[c.SecurityId].AssetClass;
        const rule = tax[asset];

        return {
            OwnerId: c.OwnerId,
            SecurityId: c.SecurityId,
            LotId: c.LotId,
            BuyDate: c.BuyDate,
            SellDate: c.SellDate,
            Quantity: c.Quantity,
            CostINR: c.CostINR,
            ProceedsINR: c.ProceedsINR,
            GainINR: c.ProceedsINR - c.CostINR,
            HoldingDays: holding,
            GainType: holding >= rule.HoldingPeriod_LT_Days ? "LTCG" : "STCG",
            AssetClass: asset,
            FinancialYear: fyFromDate(sell)
        };
    });

    writeTable("Gains_Realized", gains);
}

/**** Builds Tax Summary ****/
function buildTaxSummaryByFY() {
    const gains = readTable("Gains_Realized");
    const tax = Object.fromEntries(readTable("Config").map(t => [t.AssetClass, t]));

    const map = {};

    gains.forEach(g => {
        const k = [g.OwnerId, g.FinancialYear, g.AssetClass, g.GainType].join("|");
        if (!map[k]) map[k] = {
            OwnerId: g.OwnerId,
            FinancialYear: g.FinancialYear,
            AssetClass: g.AssetClass,
            GainType: g.GainType,
            GrossGainINR: 0
        };
        map[k].GrossGainINR += Number(g.GainINR);
    });

    const out = Object.values(map).map(r => {
        const cfg = tax[r.AssetClass];
        let exempt = (r.GainType === "LTCG") ? Number(cfg.LTCG_Exemption_INR) : 0;
        exempt = Math.min(exempt, r.GrossGainINR);

        return {
            ...r,
            ExemptINR: exempt,
            TaxableINR: r.GrossGainINR - exempt,
            TaxRate: r.GainType === "LTCG" ? cfg.LTCG_Tax_Rate : cfg.STCG_Tax_Rate
        };
    });

    writeTable("Tax_Summary_FY", out);
}

/**** Compute Cash Balance ****/
function computeCashBalances() {
    const cash = readTable("CashMovements");

    // Build Account lookup from Entities
    const accounts = Object.fromEntries(
        readTable("Entities")
            .filter(e => e.EntityType === "ACCOUNT")
            .map(a => [a.EntityId, a])
    );

    const bal = {};

    cash.forEach(c => {
        const acc = accounts[c.AccountId];
        if (!acc) return; // orphan cash row, ignore or flag elsewhere

        const key = [
            c.OwnerId,
            c.AccountId,
            acc.AccountKind,
            c.Currency
        ].join("|");

        bal[key] = (bal[key] || 0) + Number(c.Amount);
    });

    const rows = Object.entries(bal).map(([k, v]) => {
        const [OwnerId, AccountId, AccountKind, Currency] = k.split("|");
        return {
            OwnerId,
            AccountId,
            AccountKind,
            Currency,
            Balance: v
        };
    });

    writeTable("Cash_Balances", rows);
}

/**** Compute 180 Day Exposure ****/
/**** dynamic age & status ****/
function computeRBI180DayExposure() {
    const cash = readTable("CashMovements")
        .sort((a, b) => new Date(a.TxnDate) - new Date(b.TxnDate));

    let buckets = [];

    // Build FIFO foreign-income buckets
    cash.forEach(c => {
        if (c.IsForeignIncome === true || c.IsForeignIncome === "TRUE") {
            buckets.push({
                OwnerId: c.OwnerId,
                StartDate: new Date(c.TxnDate),
                RemainingAmount: Number(c.Amount)
            });
        } else if (Number(c.Amount) < 0) {
            let use = -Number(c.Amount);
            buckets.forEach(b => {
                if (use <= 0 || b.RemainingAmount <= 0) return;
                const m = Math.min(b.RemainingAmount, use);
                b.RemainingAmount -= m;
                use -= m;
            });
        }
    });

    // Write base data (no age/status computation here)
    writeTable(
        "RBI_180_Ageing",
        buckets
            .filter(b => b.RemainingAmount > 0)
            .map(b => ({
                OwnerId: b.OwnerId,
                StartDate: b.StartDate,
                RemainingAmount: b.RemainingAmount,
                AgeDays: "",   // formula
                Status: ""     // formula
            }))
    );

    // Insert dynamic formulas
    const sh = SpreadsheetApp.getActive().getSheetByName("RBI_180_Ageing");
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    // AgeDays = DAYS(TODAY(), StartDate)
    sh.getRange(2, 4, lastRow - 1, 1).setFormulaR1C1(
        `=DAYS(TODAY(), RC[-2])`
    );

    // Status logic based on AgeDays
    sh.getRange(2, 5, lastRow - 1, 1).setFormulaR1C1(
        `=IF(RC[-1]>180,"BREACH",IF(RC[-1]>150,"CLOSE TO BREACH","OK"))`
    );
}

/**** Create Views ****/
function buildPortfolioSheetFromLedger_(sheetName, portfolioKey, countryFilter) {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(sheetName);
    if (!sh) throw new Error("Missing sheet: " + sheetName);

    const lots = readTable("Lots_Current");
    const secsArr = readTable("Securities");
    const secs = Object.fromEntries(secsArr.map(s => [s.SecurityId, s]));
    const cfs = readTable("XIRR_Cashflows");

    // Target columns
    const colSymbol = colIndexByHeader(sh, "Symbol", 2);
    const colQty = colIndexByHeader(sh, "Quantity", 2);
    const colInv = colIndexByHeader(sh, "Investment", 2);
    const colCost = colIndexByHeader(sh, "Cost Basis", 2);
    const colXirr = colIndexByHeader(sh, "XIRR", 2);

    clearColumnRange(sh, colSymbol, 3);
    clearColumnRange(sh, colQty, 3);
    clearColumnRange(sh, colInv, 3);
    clearColumnRange(sh, colCost, 3);
    clearColumnRange(sh, colXirr, 3);

    /* -----------------------------
       1) Quantity + Cost by AssetId
       ----------------------------- */
    const qtyByAsset = {};
    const costByAsset = {};
    const repSecByAsset = {};

    lots.forEach(l => {
        const q = Number(l.OpenQty);
        if (!q || q <= 0) return;

        const sec = secs[l.SecurityId];
        if (!sec || sec.Country !== countryFilter) return;

        qtyByAsset[l.AssetId] = (qtyByAsset[l.AssetId] || 0) + q;
        costByAsset[l.AssetId] =
            (costByAsset[l.AssetId] || 0) + Number(l.CostNative);

        if (!repSecByAsset[l.AssetId]) {
            repSecByAsset[l.AssetId] = l.SecurityId;
        }
    });

    /* -----------------------------
       2) Investment from BUY cashflows (by AssetId)
       ----------------------------- */
    const investByAsset = {};
    cfs.forEach(cf => {
        if (cf.Portfolio !== portfolioKey) return;
        if (cf.FlowType !== "BUY") return;

        investByAsset[cf.AssetId] =
            (investByAsset[cf.AssetId] || 0) + Math.abs(Number(cf.CashFlow));
    });

    const assetIds = Object.keys(qtyByAsset).sort();

    if (assetIds.length === 0) return;

    /* -----------------------------
       3) Write rows
       ----------------------------- */
    assetIds.forEach((assetId, i) => {
        const row = i + 3;

        const repSecId = repSecByAsset[assetId];
        const ticker = secs[repSecId].Ticker;

        const qty = qtyByAsset[assetId];
        const cost = costByAsset[assetId] || 0;
        const inv = investByAsset[assetId] || 0;
        const avgCost = qty > 0 ? cost / qty : 0;

        sh.getRange(row, colSymbol).setValue(ticker);
        sh.getRange(row, colQty).setValue(qty);
        sh.getRange(row, colInv).setValue(inv);
        sh.getRange(row, colCost).setValue(avgCost);

        // XIRR by AssetId
        sh.getRange(row, colXirr).setFormula(
            `IFERROR(` +
            `XIRR(` +
            `FILTER(XIRR_Cashflows!$H:$H, XIRR_Cashflows!$A:$A="${portfolioKey}", XIRR_Cashflows!$D:$D="${assetId}"),` +
            `FILTER(XIRR_Cashflows!$G:$G, XIRR_Cashflows!$A:$A="${portfolioKey}", XIRR_Cashflows!$D:$D="${assetId}")` +
            `),` +
            `""` +
            `)`
        );
    });
}


// Helper: convert column index to A1 letter (needed to reference Symbol cell robustly)
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

function buildEquityByAccountQC() {
    const sh = resetSheet("QC_Equity_By_Account");

    sh.getRange(1, 1, 1, 6).setValues([[
        "OwnerId", "AccountId", "BrokerId", "Symbol", "Quantity", "SecurityId"
    ]]);

    const lots = readTable("Lots_Current");
    const secs = Object.fromEntries(
        readTable("Securities").map(s => [s.SecurityId, s])
    );

    const map = {};

    lots.forEach(l => {
        if (Number(l.OpenQty) <= 0) return;

        const key = [
            l.OwnerId,
            l.AccountId,
            l.BrokerId,
            l.SecurityId
        ].join("|");

        map[key] = (map[key] || 0) + Number(l.OpenQty);
    });

    const rows = Object.entries(map).map(([k, qty]) => {
        const [owner, account, broker, secId] = k.split("|");
        return [
            owner,
            account,
            broker,
            secs[secId].Ticker,
            qty,
            secId
        ];
    });

    if (rows.length === 0) return;
    sh.getRange(2, 1, rows.length, 6).setValues(rows);
}

/**** Run All ****/
function rebuildAllDerived() {
    rebuildLots();
    rebuildXIRRCashflows();
    computeRealizedGains();
    buildTaxSummaryByFY();
    computeCashBalances();
    computeRBI180DayExposure();

    buildPortfolioSheetFromLedger_("IND Portfolio", "India", "India");
    buildPortfolioSheetFromLedger_("US Portfolio", "US", "USA");
    buildEquityByAccountQC();
}



