export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
export type TransactionStatus = 'PROVISIONAL' | 'VERIFIED' | 'ADJUSTMENT';
export type AccountType = "Checking" | "Credit Card" | "Savings" | "Loan" | "Investment";
export type Scope = 'PERSONAL' | 'BUSINESS';

export type TimeframeMode = 'MONTHLY' | 'QUARTERLY' | 'CUSTOM' | 'ANNUAL';

export interface Timeframe {
  mode: TimeframeMode;
  start: Date;
  end: Date;
  label: string; // e.g. "January 2026"
}

export interface FilterState {
  scope: Scope;
  timeframe: Timeframe;
  selectedAccountIds: string[]; // Empty means ALL accounts in scope
  comparisonMode: boolean;
}


export interface Transaction {
  id: string;
  date: string;
  description_original: string;
  description_normalized: string;
  amount: number;
  type: TransactionType;
  category: string;
  subcategory?: string;
  account_id: string;
  is_duplicate: boolean;
  needs_review: boolean;
  status?: TransactionStatus;
  scope?: Scope;
}

export interface Account {
  id: string;
  name: string;
  institution?: string;
  type: AccountType;
  currency: "USD" | "COP";
  balance: number;
  // Strategic Fields for 2026 Plan
  limit?: number;        // Credit Limit for CC
  apr?: number;          // Annual Interest Rate
  closingDay?: number;   // Day of month (1-31)
  dueDay?: number;       // Day of month (1-31)
  minPayment?: number;   // For Loans/CC
  scope?: Scope;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string; // ISO Date YYYY-MM-DD
  icon: string;
  color: string;
  scope?: Scope;
}

export interface Rule {
  id: string;
  pattern: string;
  matchType: "contains" | "exact" | "starts_with";
  category: string;
  active: boolean;
  scope?: Scope;
}

export interface CategoryDef {
  name: string;
  color: string;
  budgetLimit?: number; // Monthly budget limit
  isHidden?: boolean;   // If true, hidden from budget view
  scope?: Scope;
}

// --- Phase 2: Cashflow Foundation ---

export interface IncomeSource {
  id: string;
  name: string;   // e.g. "Main Salary", "Freelance"
  amount: number; // Estimated amount
  frequency: 'MONTHLY' | 'BIWEEKLY';
  payDay1: number; // 1-31
  payDay2?: number; // If Bi-weekly (usually +15 days from day1)
  notes?: string;
  scope?: Scope;
}

// Subscription Frequencies
export type RecurringFrequency =
  | 'MONTHLY'       // Cada mes
  | 'QUARTERLY'     // Cada 3 meses
  | 'SEMI_ANNUAL'   // Cada 6 meses
  | 'ANNUAL'        // Cada año
  | 'BIENNIAL'      // Cada 2 años
  | 'TRIENNIAL';    // Cada 3 años

export interface RecurringExpense {
  id: string;
  name: string;   // e.g. "Rent", "Netflix"
  amount: number;

  // Legacy field - kept for backward compatibility
  dueDay: number; // 1-31 (DEPRECATED: use nextDueDate instead)

  // New frequency-based fields
  frequency: RecurringFrequency;  // Default: 'MONTHLY'
  startDate: string;              // YYYY-MM-DD
  nextDueDate: string;            // YYYY-MM-DD (próximo cobro)
  endDate?: string;               // YYYY-MM-DD (opcional)

  category: string;
  active: boolean;
  autoPay: boolean; // If true, funds deducted automatically
  notes?: string;

  // Smart Reserve Settings
  reservation?: {
    isEnabled: boolean;
    targetAmount?: number; // Optional override
    startDate: string;     // YYYY-MM-DD
    initialSaved?: number;
  };

  scope?: Scope;
}

// --- Phase 2: Closing Engine ---

export interface MonthlyBudget {
  id: string; // generated
  month: string; // "YYYY-MM"
  category: string; // Category Name
  scope: Scope;
  assigned: number; // The specific budget for this month
  spent: number; // Cache for performance (optional, but let's keep it simple first without it)
}

export type MonthlyClosingStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface MonthlyClosing {
  id: string;             // Format: "YYYY-MM-SCOPE" (Composite Key)
  monthStr: string;       // Format: "YYYY-MM"
  scope: Scope;           // PERSONAL | BUSINESS
  status: MonthlyClosingStatus;
  closedAt?: string;      // ISO Date
  closedBy?: string;      // User ID (future proof)
  notes?: string;

  // Snapshots
  finalAssets: number;
  finalLiabilities: number;
  finalNetWorth: number;
}
