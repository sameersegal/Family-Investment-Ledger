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

  function openLotsBySecurity(owner, securityId) {
    return lots
      .filter(l => l.OwnerId === owner && l.SecurityId === securityId && l.OpenQty > 0)
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

  const order = { BUY: 1, SPLIT: 2, BONUS: 2, MERGER: 3, SELL: 4, GIFT: 5, TRANSFER: 6 };
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

    // CLASS_REORG (e.g., Alphabet 2014: create GOOG from GOOGL)
    // Creates new lots in the target security, splitting cost based on ratio
    if (e.Type === "CLASS_REORG") {
      const fromSec = d.SecurityId;
      const toSec = d.SecurityToId;
      const fromAssetId = secs[fromSec].AssetId;
      const toAssetId = secs[toSec].AssetId;

      // Ratio determines how shares and cost are distributed
      // e.g., 1:1 means for each original share, you get 1 new share
      const numerator = Number(d.SplitNumerator) || 1;
      const denominator = Number(d.SplitDenominator) || 1;
      const qtyRatio = numerator / denominator;
      // Cost is split proportionally: new shares get ratio/(1+ratio) of cost
      const costRatioNew = qtyRatio / (1 + qtyRatio);
      const costRatioOriginal = 1 - costRatioNew;

      // Find all open lots for the source security
      const sourceLots = lots.filter(l =>
        l.AssetId === fromAssetId &&
        l.SecurityId === fromSec &&
        l.OpenQty > 0
      );

      sourceLots.forEach(lot => {
        const newQty = lot.OpenQty * qtyRatio;
        const newCostNative = lot.CostNative * costRatioNew;
        const newCostINR = lot.CostINR * costRatioNew;

        // Create new lot in target security
        lots.push({
          LotId: "LOT_" + lotSeq++,
          OwnerId: lot.OwnerId,
          SecurityId: toSec,
          AssetId: toAssetId,
          BuyDate: lot.BuyDate,
          OpenQty: newQty,
          CostNative: newCostNative,
          CostPriceNative: newQty > 0 ? newCostNative / newQty : 0,
          CostINR: newCostINR,
          BuyFXRate: lot.BuyFXRate,
          BrokerId: lot.BrokerId,
          AccountId: lot.AccountId
        });

        // Reduce original lot cost proportionally
        lot.CostNative *= costRatioOriginal;
        lot.CostINR *= costRatioOriginal;
        lot.CostPriceNative = lot.OpenQty > 0 ? lot.CostNative / lot.OpenQty : 0;
      });
    }

    // SELL (FIFO)
    if (e.Type === "SELL") {
      let qty = Number(d.Quantity);
      const salePrice = Number(d.Price);
      const saleFX = Number(d.FXRateToINR);
      const assetId = secs[d.SecurityId].AssetId;
      const securityId = d.SecurityId;

      for (const lot of openLotsBySecurity(d.OwnerId, securityId)) {
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

    // BONUS (new shares with zero cost basis for Indian tax purposes)
    // SplitNumerator/SplitDenominator = total shares after / shares before
    // e.g., 2:1 means 1:1 bonus (1 bonus share for every 1 held, doubling total)
    // Bonus shares are treated as new lots with:
    //   - Cost basis = 0 (for tax purposes)
    //   - Holding period starts from bonus issue date (ActionDate)
    if (e.Type === "BONUS") {
      const factor = Number(d.SplitNumerator) / Number(d.SplitDenominator);
      const bonusRatio = factor - 1; // e.g., 2:1 means 1 bonus share per 1 held
      const assetId = secs[d.SecurityId].AssetId;

      // Collect lots to process (snapshot before modification)
      const lotsToProcess = lots.filter(l =>
        l.SecurityId === d.SecurityId && l.OpenQty > 0
      );

      lotsToProcess.forEach(l => {
        const bonusQty = l.OpenQty * bonusRatio;

        if (bonusQty > 0) {
          // Create new lot for bonus shares with zero cost basis
          lots.push({
            LotId: "LOT_" + lotSeq++,
            OwnerId: l.OwnerId,
            SecurityId: l.SecurityId,
            AssetId: assetId,
            BuyDate: d.ActionDate,           // Holding period starts from bonus date
            OpenQty: bonusQty,
            CostNative: 0,                   // Zero cost for bonus shares
            CostPriceNative: 0,              // Zero cost per share
            CostINR: 0,                      // Zero cost in INR
            BuyFXRate: l.BuyFXRate ?? 1,     // Preserve FX rate context
            BrokerId: l.BrokerId,
            AccountId: l.AccountId
          });
        }
        // Original lot cost basis remains unchanged (unlike SPLIT)
      });
    }

    // MERGER (security conversion: e.g., WORK -> CRM)
    // Converts shares from one security to another with a ratio, preserving cost basis
    if (e.Type === "MERGER") {
      const ratio = Number(d.SplitNumerator) / Number(d.SplitDenominator);
      const fromSec = d.SecurityId;
      const toSec = d.SecurityToId;
      const toAssetId = secs[toSec].AssetId;

      lots.forEach(l => {
        if (l.SecurityId === fromSec && l.OpenQty > 0) {
          // Convert to new security, preserving total cost basis
          // Floor the quantity since fractional shares are paid in cash
          const newQty = Math.floor(l.OpenQty * ratio);
          l.SecurityId = toSec;
          l.AssetId = toAssetId;
          l.CostPriceNative = l.CostNative / newQty; // per-share cost based on new quantity
          l.OpenQty = newQty;
          // CostNative and CostINR stay the same (total cost preserved)
        }
      });
    }

    // GIFT
    if (e.Type === "GIFT") {
      let qty = Number(d.Quantity);
      const assetId = secs[d.SecurityId].AssetId;
      const securityId = d.SecurityId;

      for (const lot of openLotsBySecurity(d.OwnerFromId, securityId)) {
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
          BrokerId: d.BrokerToId,
          AccountId: d.AccountToId
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
      const securityId = d.SecurityId;

      for (const lot of openLotsBySecurity(d.OwnerFromId, securityId)) {
        if (qty <= 0) break;
        const move = Math.min(lot.OpenQty, qty);
        const frac = move / lot.OpenQty;

        if (move < lot.OpenQty) {
          // Partial transfer: create new lot at destination
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
            BrokerId: d.BrokerToId,
            AccountId: d.AccountToId
          });

          lot.OpenQty -= move;
          lot.CostNative -= costNativeMove;
          lot.CostINR -= costINRMove;
        } else {
          // Full transfer: just update the existing lot
          lot.OwnerId = d.OwnerToId;
          lot.BrokerId = d.BrokerToId;
          lot.AccountId = d.AccountToId;
        }
        qty -= move;
      }
    }
  });

  const finalLots = lots.filter(l => l.OpenQty > 0);

  writeTable("Lots_Current", finalLots);
  writeTable("LotConsumes", consumes);
}



/**** Create Cashflow for XIRR ****/
function rebuildXIRRCashflows() {
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
  const headers = ["Portfolio", "OwnerId", "SecurityId", "AssetId", "Symbol", "Quantity", "FlowDate", "CashFlow", "FlowType"];

  /* -----------------------------
     2) BUY / SELL cashflows (execution-level)
     ----------------------------- */
  trades.forEach(t => {
    const sec = secs[t.SecurityId];
    if (!sec) return;

    const portfolio = (sec.Country === "INDIA") ? "India" : "US";
    const amt = Number(t.Quantity) * Number(t.Price);
    const cashflow = (t.Side === "BUY") ? -amt : amt;

    rows.push({
      Portfolio: portfolio,
      OwnerId: t.OwnerId,
      SecurityId: t.SecurityId,
      AssetId: sec.AssetId,
      Symbol: sec.Ticker,
      Quantity: "",
      FlowDate: new Date(t.TradeDate),
      CashFlow: cashflow,
      FlowType: t.Side
    });
  });

  /* -----------------------------
     3) CURRENT_VALUE (ONE per AssetId)
     ----------------------------- */
  Object.entries(qtyByAsset).forEach(([assetId, qty]) => {
    const repSecId = repSecByAsset[assetId];
    const sec = secs[repSecId];
    if (!sec) return;

    const portfolio = (sec.Country === "INDIA") ? "India" : "US";

    rows.push({
      Portfolio: portfolio,
      OwnerId: "",
      SecurityId: repSecId,
      AssetId: assetId,
      Symbol: sec.Ticker,
      Quantity: qty,
      FlowDate: "",  // formula in Sheets
      CashFlow: "",  // formula in Sheets
      FlowType: "CURRENT_VALUE"
    });
  });

  if (rows.length === 0) return;

  // In local mode, just write the data
  if (IS_LOCAL) {
    writeTable("XIRR_Cashflows", rows);
    return;
  }

  // In Sheets mode, use the sheet-based approach with formulas
  const sh = resetSheet("XIRR_Cashflows");
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  const arrayRows = rows.map(r => headers.map(h => r[h]));
  sh.getRange(2, 1, arrayRows.length, headers.length).setValues(arrayRows);

  /* -----------------------------
     4) Formulas ONLY for CURRENT_VALUE rows
     ----------------------------- */
  const startRow = 2;
  for (let i = 0; i < rows.length; i++) {
    const rowNum = startRow + i;
    const flowType = rows[i].FlowType;

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

  // Insert dynamic formulas (skip in local mode)
  if (IS_LOCAL) return;

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
  // Skip view building in local mode (requires Google Sheets UI features)
  if (IS_LOCAL) {
    console.log(`Skipping ${sheetName} view build in local mode`);
    return;
  }

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


function buildEquityByAccountQC() {
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
    return {
      OwnerId: owner,
      AccountId: account,
      BrokerId: broker,
      Symbol: secs[secId] ? secs[secId].Ticker : secId,
      Quantity: qty,
      SecurityId: secId
    };
  });

  // In local mode, use writeTable
  if (IS_LOCAL) {
    writeTable("QC_Equity_By_Account", rows);
    return;
  }

  // In Sheets mode
  const sh = resetSheet("QC_Equity_By_Account");
  sh.getRange(1, 1, 1, 6).setValues([[
    "OwnerId", "AccountId", "BrokerId", "Symbol", "Quantity", "SecurityId"
  ]]);

  if (rows.length === 0) return;

  const headers = ["OwnerId", "AccountId", "BrokerId", "Symbol", "Quantity", "SecurityId"];
  const arrayRows = rows.map(r => headers.map(h => r[h]));
  sh.getRange(2, 1, arrayRows.length, 6).setValues(arrayRows);
}

/**** Sensitivity Analysis Data ****/
/**
 * Build concise lot data for sensitivity analysis with LLMs.
 * Outputs essential columns for "how to raise cash while minimizing tax" analysis.
 * 
 * For Sheets mode: uses GOOGLEFINANCE for live prices.
 * For local mode: uses Prices.json if available.
 * 
 * Concise columns optimized for LLM context:
 * - OwnerId, Ticker, AccountId - identification
 * - Qty, CostINR - position
 * - GainType, DaysToLTCG, TaxRate - tax classification
 * - ValueINR, GainINR, TaxINR - current value & tax estimate
 */
function buildSensitivityData() {
  const lots = readTable("Lots_Current");
  const secs = Object.fromEntries(
    readTable("Securities").map(s => [s.SecurityId, s])
  );
  const tax = Object.fromEntries(
    readTable("Config").map(t => [t.AssetClass, t])
  );

  const today = new Date();

  // Build concise analysis data
  const analysis = lots.filter(l => l.OpenQty > 0).map(l => {
    const sec = secs[l.SecurityId] || {};
    const rule = tax[sec.AssetClass] || {};

    const buyDate = new Date(l.BuyDate);
    const holdingDays = daysBetween(buyDate, today);
    const ltDays = Number(rule.HoldingPeriod_LT_Days) || 365;
    const gainType = holdingDays >= ltDays ? "LTCG" : "STCG";
    const daysToLTCG = gainType === "LTCG" ? 0 : ltDays - holdingDays;

    const taxRateStr = gainType === "LTCG" ? rule.LTCG_Tax_Rate : rule.STCG_Tax_Rate;
    const taxRate = parseTaxRate(taxRateStr);
    const currency = sec.TradingCurrency || "USD";
    const ticker = sec.Ticker || l.SecurityId;

    return {
      OwnerId: l.OwnerId,
      Ticker: ticker,
      Qty: l.OpenQty,
      CostINR: Math.round(l.CostINR),
      Type: gainType === "LTCG" ? "L" : "S",
      ToLTCG: daysToLTCG > 0 ? daysToLTCG : "",
      // These will be formulas in Sheets mode
      ValueINR: "",
      GainINR: "",
      TaxINR: "",
      // Internal use for formulas and sorting
      _currency: currency,
      _ticker: ticker,
      _buyDate: l.BuyDate,
      _taxRate: taxRate
    };
  });

  // Sort by owner, then ticker, then buy date
  analysis.sort((a, b) => {
    if (a.OwnerId !== b.OwnerId) return a.OwnerId.localeCompare(b.OwnerId);
    if (a.Ticker !== b.Ticker) return a.Ticker.localeCompare(b.Ticker);
    return new Date(a._buyDate) - new Date(b._buyDate);
  });

  // In local mode, try to use Prices.json for values
  if (IS_LOCAL) {
    let prices = {};
    let fxRates = {};
    try {
      const pricesData = readTable("Prices");
      prices = Object.fromEntries(pricesData.map(p => [p.SecurityId, Number(p.Price)]));
      fxRates = Object.fromEntries(pricesData.filter(p => p.FXRate).map(p => [p.Currency, Number(p.FXRate)]));
    } catch (e) {
      // Prices not available
    }

    analysis.forEach(a => {
      const priceNative = prices[a._ticker] || null;
      const fxRate = fxRates[a._currency] || (a._currency === "INR" ? 1 : null);

      if (priceNative && fxRate) {
        const valueINR = a.Qty * priceNative * fxRate;
        const gainINR = valueINR - a.CostINR;
        a.ValueINR = Math.round(valueINR);
        a.GainINR = Math.round(gainINR);
        a.TaxINR = gainINR > 0 ? Math.round(gainINR * a._taxRate) : 0;
      }
    });

    // Build meta info for LLM context (before removing internal fields)
    const meta = buildSensitivityMeta_(analysis);

    // Remove internal fields before writing
    analysis.forEach(a => {
      delete a._currency;
      delete a._ticker;
      delete a._buyDate;
      delete a._taxRate;
    });

    // Write meta + data as structured JSON for local
    const output = { meta: meta, lots: analysis };
    writeTable("Sensitivity_Data", [output]);
    buildSensitivitySummary_(analysis);
    return;
  }

  // Sheets mode: write data and add GOOGLEFINANCE formulas
  const headers = [
    "OwnerId", "Ticker",
    "Qty", "CostINR",
    "Type", "ToLTCG",
    "ValueINR", "GainINR", "TaxINR"
  ];

  // Build meta info for LLM context
  const meta = buildSensitivityMeta_(analysis);

  const sh = resetSheet("Sensitivity_Data");

  // Row 1: Meta information
  sh.getRange(1, 1).setValue(meta);

  // Row 2: Headers
  sh.getRange(2, 1, 1, headers.length).setValues([headers]);

  if (analysis.length === 0) return;

  // Write static data columns starting from row 3
  const staticHeaders = headers.slice(0, 6);
  const staticData = analysis.map(r => staticHeaders.map(h => r[h]));
  sh.getRange(3, 1, staticData.length, staticHeaders.length).setValues(staticData);

  // Add formulas for dynamic columns (7-9)
  // Column indices (1-based): 
  // B=Ticker, C=Qty, D=CostINR
  // G=ValueINR, H=GainINR, I=TaxINR

  for (let i = 0; i < analysis.length; i++) {
    const row = i + 3; // Data starts at row 3 now
    const currency = analysis[i]._currency;
    const taxRate = analysis[i]._taxRate;

    // ValueINR (G) = Qty * GOOGLEFINANCE(Ticker) * FXRate
    if (currency === "INR") {
      sh.getRange(row, 7).setFormula(
        `=IFERROR(ROUND(C${row}*GOOGLEFINANCE(B${row})), "")`
      );
    } else {
      sh.getRange(row, 7).setFormula(
        `=IFERROR(ROUND(C${row}*GOOGLEFINANCE(B${row})*GOOGLEFINANCE("CURRENCY:${currency}INR")), "")`
      );
    }

    // GainINR (H) = ValueINR - CostINR
    sh.getRange(row, 8).setFormula(
      `=IF(G${row}<>"", G${row}-D${row}, "")`
    );

    // TaxINR (I) = ROUND(MAX(0, GainINR) * TaxRate)
    sh.getRange(row, 9).setFormula(
      `=IF(H${row}<>"", ROUND(MAX(0, H${row})*${taxRate}), "")`
    );
  }
}

/**
 * Build meta information string for LLM context
 */
function buildSensitivityMeta_(analysis) {
  const today = new Date().toISOString().split('T')[0];
  const owners = [...new Set(analysis.map(a => a.OwnerId))].sort();
  const tickers = [...new Set(analysis.map(a => a.Ticker))].sort();
  const totalLots = analysis.length;

  const totalCost = analysis.reduce((sum, a) => sum + a.CostINR, 0);
  const stcgCount = analysis.filter(a => a.Type === "S").length;
  const ltcgCount = analysis.filter(a => a.Type === "L").length;

  // Get unique tax rates for context
  const taxRates = [...new Set(analysis.map(a => a._taxRate))].sort((a, b) => a - b);

  const meta = [
    `DATA: Family portfolio lots for tax-efficient cash raising analysis. Tax computation needs to be done in FIFO manner. Lots listed below are in FIFO order. We cannot pick and choose the lots to sell.`,
    `DATE: ${today}`,
    `OWNERS: ${owners.join(", ")}`,
    `TICKERS: ${tickers.join(", ")}`,
    `LOTS: ${totalLots} (${ltcgCount} L, ${stcgCount} S)`,
    `TOTAL_COST_INR: ${Math.round(totalCost).toLocaleString()}`,
    `COLUMNS: OwnerId=owner, Ticker=stock, Qty=shares, CostINR=cost basis, Type=L(long-term)/S(short-term), ToLTCG=days until long-term (blank=already L), ValueINR=current value, GainINR=unrealized gain, TaxINR=estimated tax if sold`,
    `RULES: Type L taxed at ${taxRates.filter(r => r < 0.2).map(r => (r * 100).toFixed(1) + '%').join('/')} (lower). Type S taxed at slab/higher rates. Negative GainINR=loss (TaxINR=0). To minimize tax: sell losses first, then L, then low-gain lots.`
  ].join(" | ");

  return meta;
}

/**
 * Build summary table from analysis data (helper function)
 */
function buildSensitivitySummary_(analysis) {
  const summary = {};
  analysis.forEach(a => {
    const key = `${a.OwnerId}|${a.Ticker}`;
    if (!summary[key]) {
      summary[key] = {
        OwnerId: a.OwnerId,
        Ticker: a.Ticker,
        TotalQty: 0,
        TotalCostINR: 0,
        TotalValueINR: 0,
        TotalGainINR: 0,
        TotalTaxINR: 0,
        LotCount: 0,
        HasS: false,
        HasL: false
      };
    }
    const s = summary[key];
    s.TotalQty += a.Qty;
    s.TotalCostINR += a.CostINR;
    s.TotalValueINR += a.ValueINR || 0;
    s.TotalGainINR += a.GainINR || 0;
    s.TotalTaxINR += a.TaxINR || 0;
    s.LotCount += 1;
    if (a.Type === "S") s.HasS = true;
    if (a.Type === "L") s.HasL = true;
  });

  const summaryRows = Object.values(summary).map(s => ({
    OwnerId: s.OwnerId,
    Ticker: s.Ticker,
    TotalQty: s.TotalQty,
    TotalCostINR: s.TotalCostINR,
    TotalValueINR: s.TotalValueINR,
    TotalGainINR: s.TotalGainINR,
    GainPct: s.TotalCostINR > 0 ? Math.round((s.TotalGainINR / s.TotalCostINR) * 100) : 0,
    TotalTaxINR: s.TotalTaxINR,
    LotCount: s.LotCount,
    TypeMix: s.HasS && s.HasL ? "MIX" : (s.HasL ? "L" : "S")
  }));

  summaryRows.sort((a, b) => {
    if (a.OwnerId !== b.OwnerId) return a.OwnerId.localeCompare(b.OwnerId);
    return a.Ticker.localeCompare(b.Ticker);
  });

  writeTable("Sensitivity_Summary", summaryRows);
}

/**** Run All ****/
function rebuildAllDerived() {
  rebuildLots();
  rebuildXIRRCashflows();
  computeRealizedGains();
  buildTaxSummaryByFY();
  computeCashBalances();
  computeRBI180DayExposure();

  buildPortfolioSheetFromLedger_("IND Portfolio", "India", "INDIA");
  buildPortfolioSheetFromLedger_("US Portfolio", "US", "USA");
  buildEquityByAccountQC();
  buildSensitivityData();
}



