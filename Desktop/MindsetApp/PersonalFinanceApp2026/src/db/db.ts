import Dexie, { Table } from 'dexie';
import { Transaction, Account, Goal, Rule, CategoryDef, IncomeSource, RecurringExpense } from '../types';
import { DEFAULT_CATEGORIES } from '../utils';

export class FinMapDB extends Dexie {
    transactions!: Table<Transaction>;
    accounts!: Table<Account>;
    goals!: Table<Goal>;
    rules!: Table<Rule>;
    categories!: Table<CategoryDef>;
    // Phase 2
    incomeSources!: Table<IncomeSource>;
    recurringExpenses!: Table<RecurringExpense>;

    constructor() {
        super('FinMapDB');
        this.version(2).stores({
            transactions: 'id, date, type, category, account_id',
            accounts: 'id, type',
            goals: 'id',
            rules: 'id',
            categories: 'name',
            incomeSources: 'id',
            recurringExpenses: 'id, category'
        });
    }

    async resetDatabase() {
        await this.transaction('rw', [this.transactions, this.accounts, this.goals, this.rules, this.categories, this.incomeSources, this.recurringExpenses], async () => {
            await Promise.all([
                this.transactions.clear(),
                this.accounts.clear(),
                this.goals.clear(),
                this.rules.clear(),
                this.categories.clear(),
                this.incomeSources.clear(),
                this.recurringExpenses.clear()
            ]);
            // Reseed default categories
            await this.categories.bulkAdd(DEFAULT_CATEGORIES);
        });
    }
}

export const db = new FinMapDB();

// Initialize default categories if empty
db.on('populate', () => {
    db.categories.bulkAdd(DEFAULT_CATEGORIES);
});
