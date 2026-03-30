/**
 * AUTO-GENERATED FILE. DO NOT EDIT.
 * Run `npm run generate:types` to regenerate from schema/neo-ledger-data-model.schema.json.
 */

/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "Identifier".
 */
export type Identifier = string;
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "IsoDate".
 */
export type IsoDate = string;
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "IsoDateTimeOrBlank".
 */
export type IsoDateTimeOrBlank = string | '';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "StringOrBlank".
 */
export type StringOrBlank = string;
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "BooleanLike".
 */
export type BooleanLike = boolean | ('TRUE' | 'FALSE' | '');
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "NumberOrBlank".
 */
export type NumberOrBlank = number | '';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "TaxRate".
 */
export type TaxRate = string | number;
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "FinancialYear".
 */
export type FinancialYear = string;
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "TradeSide".
 */
export type TradeSide = 'BUY' | 'SELL';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotActionType".
 */
export type LotActionType = 'SPLIT' | 'BONUS' | 'MERGER' | 'CLASS_REORG' | 'GIFT' | 'TRANSFER';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "CashCategory".
 */
export type CashCategory =
  | 'DIVIDEND'
  | 'INTEREST'
  | 'TAX'
  | 'FEE'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'FOREX'
  | 'OTHER'
  | 'BUY_SETTLEMENT'
  | 'SELL_PROCEEDS'
  | 'SALE_PROCEEDS'
  | 'REINVESTMENT'
  | 'REPATRIATION'
  | 'OPENING_BALANCE';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "BondType".
 */
export type BondType = 'TBILL';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "BondSide".
 */
export type BondSide = 'BUY' | 'MATURITY';
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "AssertionRow".
 */
export type AssertionRow = {
  [k: string]: unknown;
} & {
  type: 'quantity' | 'no_negative' | 'no_invalid';
  owner?: StringOrBlank;
  security?: StringOrBlank;
  account?: StringOrBlank;
  expected?: number;
  desc: Identifier;
};
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "ConfigFile".
 */
export type ConfigFile = ConfigRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "EntitiesFile".
 */
export type EntitiesFile = EntityRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SecuritiesFile".
 */
export type SecuritiesFile = SecurityRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "TradesFile".
 */
export type TradesFile = TradeRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotActionsFile".
 */
export type LotActionsFile = LotActionRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "CashMovementsFile".
 */
export type CashMovementsFile = CashMovementRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "PricesFile".
 */
export type PricesFile = PriceRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "AssertionsFile".
 */
export type AssertionsFile = AssertionRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotsCurrentFile".
 */
export type LotsCurrentFile = LotCurrentRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotConsumesFile".
 */
export type LotConsumesFile = LotConsumeRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "GainsRealizedFile".
 */
export type GainsRealizedFile = GainRealizedRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "TaxSummaryFYFile".
 */
export type TaxSummaryFYFile = TaxSummaryFYRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "CashBalancesFile".
 */
export type CashBalancesFile = CashBalanceRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "XIRRCashflowsFile".
 */
export type XIRRCashflowsFile = XIRRCashflowRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "RBI180AgeingFile".
 */
export type RBI180AgeingFile = RBIAgeingRow[];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "QCEquityByAccountFile".
 */
export type QCEquityByAccountFile = QCEquityByAccountRow[];
/**
 * @minItems 1
 * @maxItems 1
 *
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SensitivityDataFile".
 */
export type SensitivityDataFile = [SensitivityDataDocument];
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SensitivitySummaryFile".
 */
export type SensitivitySummaryFile = SensitivitySummaryRow[];

/**
 * Reusable JSON Schema definitions for Neo Ledger input tables, derived tables, and the bank-statement parser adapter contract. Validate individual files with fragment refs such as #/$defs/TradesFile or #/$defs/CashMovementsFile.
 */
export interface NeoLedgerDataModelRegistry {}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "BondTransactionRow".
 */
export interface BondTransactionRow {
  BondTxnId: Identifier;
  TxnDate: IsoDate;
  OwnerId: Identifier;
  AccountId: Identifier;
  BrokerId: Identifier;
  BondType: BondType;
  Side: BondSide;
  Currency: Identifier;
  FaceValue: number;
  Price: number;
  Quantity: number;
  FXRate: number;
  MaturityDate: IsoDate;
  Notes: StringOrBlank;
  SourceRef: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "BondCurrentRow".
 */
export interface BondCurrentRow {
  OwnerId?: Identifier;
  AccountId?: Identifier;
  BrokerId?: Identifier;
  BondType?: BondType;
  Currency?: Identifier;
  MaturityDate?: IsoDate;
  Quantity?: number;
  FaceValue?: number;
  PurchasePrice?: number;
  PurchaseDate?: IsoDate;
  FXRateAtPurchase?: number;
  FXRateAtMaturity?: NumberOrBlank;
  Status?: 'ACTIVE' | 'MATURED';
  InvestedAmountLocal?: number;
  MaturityAmountLocal?: number;
  GainLocal?: number;
  InvestedAmountINR?: number;
  MaturityAmountINR?: NumberOrBlank;
  GainINR?: NumberOrBlank;
  HoldingDays?: number;
  FY?: string;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "ConfigRow".
 */
export interface ConfigRow {
  AssetClass: Identifier;
  HoldingPeriod_ST_Days: number;
  HoldingPeriod_LT_Days: number;
  STCG_Tax_Rate: TaxRate;
  LTCG_Tax_Rate: TaxRate;
  LTCG_Exemption_INR: number;
  Indexation_Allowed: BooleanLike;
  Tax_Regime_Notes: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "EntityRow".
 */
export interface EntityRow {
  EntityId: string;
  EntityType: 'OWNER' | 'BROKER' | 'ACCOUNT' | '';
  Name: StringOrBlank;
  OwnerId: StringOrBlank;
  BrokerId: StringOrBlank;
  Country: StringOrBlank;
  Currency: StringOrBlank;
  AccountKind: StringOrBlank;
  IsForeignAccount: BooleanLike;
  FEMACategoryNotes: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SecurityRow".
 */
export interface SecurityRow {
  SecurityId: Identifier;
  Ticker: Identifier;
  AssetId: Identifier;
  Exchange: StringOrBlank;
  Country: StringOrBlank;
  AssetClass: Identifier;
  TradingCurrency: Identifier;
  Name: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "TradeRow".
 */
export interface TradeRow {
  TradeId: Identifier;
  TradeDate: IsoDate;
  OwnerId: Identifier;
  BrokerId: Identifier;
  AccountId: Identifier;
  SecurityId: Identifier;
  Side: TradeSide;
  Quantity: number;
  Price: number;
  Fees: number;
  FXRateToINR: number;
  Notes: StringOrBlank;
  SourceRef: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotActionRow".
 */
export interface LotActionRow {
  ActionId: Identifier;
  ActionDate: IsoDate;
  ActionType: LotActionType;
  OwnerFromId: StringOrBlank;
  OwnerToId: StringOrBlank;
  BrokerFromId: StringOrBlank;
  BrokerToId: StringOrBlank;
  AccountFromId: StringOrBlank;
  AccountToId: StringOrBlank;
  SecurityId: Identifier;
  SecurityToId: StringOrBlank;
  SplitNumerator: NumberOrBlank;
  SplitDenominator: NumberOrBlank;
  Quantity: NumberOrBlank;
  Notes: StringOrBlank;
  SourceRef: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "CashMovementRow".
 */
export interface CashMovementRow {
  CashTxnId: Identifier;
  TxnDate: IsoDate;
  OwnerId: Identifier;
  AccountId: Identifier;
  Currency: Identifier;
  Amount: number;
  Category: CashCategory;
  LinkedTradeId: StringOrBlank;
  LinkedActionId: StringOrBlank;
  IsForeignIncome: BooleanLike;
  Notes: StringOrBlank;
  SourceRef: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "PriceRow".
 */
export interface PriceRow {
  SecurityId: Identifier;
  Price: number;
  Currency?: StringOrBlank;
  FXRate?: NumberOrBlank;
  [k: string]: unknown;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotCurrentRow".
 */
export interface LotCurrentRow {
  LotId: Identifier;
  OwnerId: Identifier;
  SecurityId: Identifier;
  AssetId: Identifier;
  BuyDate: IsoDate;
  OpenQty: number;
  CostNative: number;
  CostPriceNative: number;
  CostINR: number;
  BuyFXRate: number;
  BrokerId: Identifier;
  AccountId: Identifier;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "LotConsumeRow".
 */
export interface LotConsumeRow {
  ConsumeId: Identifier;
  TradeId: Identifier;
  OwnerId: Identifier;
  SecurityId: Identifier;
  AssetId: Identifier;
  LotId: Identifier;
  BuyDate: IsoDate;
  SellDate: IsoDate;
  Quantity: number;
  CostNative: number;
  CostPriceNative: number;
  CostINR: number;
  CostFXRate: number | null;
  SalePriceNative: number;
  SaleFXRate: number;
  ProceedsNative: number;
  ProceedsINR: number;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "GainRealizedRow".
 */
export interface GainRealizedRow {
  OwnerId: Identifier;
  SecurityId: Identifier;
  LotId: Identifier;
  BuyDate: IsoDate;
  SellDate: IsoDate;
  Quantity: number;
  CostINR: number;
  ProceedsINR: number;
  GainINR: number;
  HoldingDays: number;
  GainType: 'STCG' | 'LTCG';
  AssetClass: Identifier;
  FinancialYear: FinancialYear;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "TaxSummaryFYRow".
 */
export interface TaxSummaryFYRow {
  OwnerId: Identifier;
  FinancialYear: FinancialYear;
  AssetClass: Identifier;
  GainType: 'STCG' | 'LTCG';
  GrossGainINR: number;
  ExemptINR: number;
  TaxableINR: number;
  TaxRate: TaxRate;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "CashBalanceRow".
 */
export interface CashBalanceRow {
  OwnerId: Identifier;
  AccountId: Identifier;
  AccountKind: StringOrBlank;
  Currency: Identifier;
  Balance: number;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "XIRRCashflowRow".
 */
export interface XIRRCashflowRow {
  Portfolio: 'India' | 'US';
  OwnerId: StringOrBlank;
  SecurityId: Identifier;
  AssetId: Identifier;
  Symbol: Identifier;
  Quantity: NumberOrBlank;
  FlowDate: IsoDateTimeOrBlank;
  CashFlow: NumberOrBlank;
  FlowType: 'BUY' | 'SELL' | 'CURRENT_VALUE';
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "RBIAgeingRow".
 */
export interface RBIAgeingRow {
  OwnerId: Identifier;
  StartDate: IsoDate;
  RemainingAmount: number;
  AgeDays: NumberOrBlank;
  Status: StringOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "QCEquityByAccountRow".
 */
export interface QCEquityByAccountRow {
  OwnerId: Identifier;
  AccountId: Identifier;
  BrokerId: Identifier;
  Symbol: Identifier;
  Quantity: number;
  SecurityId: Identifier;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SensitivityLotRow".
 */
export interface SensitivityLotRow {
  OwnerId: Identifier;
  Ticker: Identifier;
  BuyDate: IsoDate;
  Qty: number;
  CostINR: number;
  Type: 'L' | 'S';
  ToLTCG: number | '';
  ValueINR: NumberOrBlank;
  GainINR: NumberOrBlank;
  TaxINR: NumberOrBlank;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SensitivityDataDocument".
 */
export interface SensitivityDataDocument {
  meta: Identifier;
  lots: SensitivityLotRow[];
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "SensitivitySummaryRow".
 */
export interface SensitivitySummaryRow {
  OwnerId: Identifier;
  Ticker: Identifier;
  TotalQty: number;
  TotalCostINR: number;
  TotalValueINR: number;
  TotalGainINR: number;
  GainPct: number;
  TotalTaxINR: number;
  LotCount: number;
  TypeMix: 'S' | 'L' | 'MIX';
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "ParserPeriod".
 */
export interface ParserPeriod {
  from: IsoDate;
  to: IsoDate;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "ParserPositionTransaction".
 */
export interface ParserPositionTransaction {
  date: IsoDate;
  type: 'buy' | 'sell';
  ticker: Identifier;
  quantity: number;
  price: number;
  amount: number;
  currency: Identifier;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "ParserCashTransaction".
 */
export interface ParserCashTransaction {
  date: IsoDate;
  type: 'buy' | 'sell' | 'dividend' | 'interest' | 'fee' | 'deposit' | 'withdrawal' | 'forex' | 'tax' | 'other';
  description: StringOrBlank;
  amount: number;
  currency: Identifier;
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "ParserStatement".
 */
export interface ParserStatement {
  broker: 'ibkr' | 'schwab';
  account_id: Identifier;
  period: ParserPeriod;
  position_transactions: ParserPositionTransaction[];
  cash_transactions: ParserCashTransaction[];
}
/**
 * This interface was referenced by `NeoLedgerDataModelRegistry`'s JSON-Schema
 * via the `definition` "AdapterConfig".
 */
export interface AdapterConfig {
  sourceId: Identifier;
  parserBroker: 'ibkr' | 'schwab';
  parserAccountId: Identifier;
  ownerId: Identifier;
  brokerId: Identifier;
  accountId: Identifier;
  defaultTradeFee: number;
  defaultCashIsForeignIncome: boolean;
  securityMap: {
    [k: string]: Identifier;
  };
  currencyToINR: {
    [k: string]: number;
  };
}
