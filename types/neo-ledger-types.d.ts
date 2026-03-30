import type {
    AssertionRow,
    BondCurrentRow,
    BondTransactionRow,
    CashBalanceRow,
    CashMovementRow,
    ConfigRow,
    EntityRow,
    GainRealizedRow,
    LotActionRow,
    LotConsumeRow,
    LotCurrentRow,
    PriceRow,
    QCEquityByAccountRow,
    RBIAgeingRow,
    SecurityRow,
    SensitivityDataDocument,
    SensitivitySummaryRow,
    TaxSummaryFYRow,
    TradeRow,
    XIRRCashflowRow
} from './neo-ledger.generated';

export interface TableNameMap {
    Config: ConfigRow[];
    Entities: EntityRow[];
    Securities: SecurityRow[];
    Trades: TradeRow[];
    LotActions: LotActionRow[];
    CashMovements: CashMovementRow[];
    Prices: PriceRow[];
    Assertions: AssertionRow[];
    Lots_Current: LotCurrentRow[];
    LotConsumes: LotConsumeRow[];
    Gains_Realized: GainRealizedRow[];
    Tax_Summary_FY: TaxSummaryFYRow[];
    Cash_Balances: CashBalanceRow[];
    XIRR_Cashflows: XIRRCashflowRow[];
    RBI_180_Ageing: RBIAgeingRow[];
    QC_Equity_By_Account: QCEquityByAccountRow[];
    Sensitivity_Data: SensitivityDataDocument[];
    Sensitivity_Summary: SensitivitySummaryRow[];
    Bond_Transactions: BondTransactionRow[];
    Bonds_Current: BondCurrentRow[];
}

export type TableName = keyof TableNameMap;
