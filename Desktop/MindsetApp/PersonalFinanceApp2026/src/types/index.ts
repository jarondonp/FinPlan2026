export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
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
  scope?: Scope;
}

export interface RecurringExpense {
  id: string;
  name: string;   // e.g. "Rent", "Netflix"
  amount: number;
  dueDay: number; // 1-31
  category: string;
  active: boolean;
  autoPay: boolean; // If true, funds deducted automatically
  scope?: Scope;
}
