import Dexie, { Table } from 'dexie';
import { Transaction, Account, Goal, Rule, CategoryDef, IncomeSource, RecurringExpense, MonthlyClosing, MonthlyBudget } from '../types';
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
    monthlyClosings!: Table<MonthlyClosing>;

    monthlyBudgets!: Table<MonthlyBudget>;

    constructor() {
        super('FinMapDB');

        // Version 5: Original schema
        this.version(5).stores({
            transactions: 'id, date, type, category, account_id, scope',
            accounts: 'id, type, scope',
            goals: 'id, scope',
            rules: 'id, scope',
            categories: 'name, scope',
            incomeSources: 'id, scope',
            recurringExpenses: 'id, category, scope',
            monthlyClosings: 'id, monthStr, scope, status',
            monthlyBudgets: 'id, [month+scope], category'
        });

        // Version 6: Add subscription frequency support
        this.version(6).stores({
            transactions: 'id, date, type, category, account_id, scope',
            accounts: 'id, type, scope',
            goals: 'id, scope',
            rules: 'id, scope',
            categories: 'name, scope',
            incomeSources: 'id, scope',
            recurringExpenses: 'id, category, scope, frequency, nextDueDate', // Added indexes
            monthlyClosings: 'id, monthStr, scope, status',
            monthlyBudgets: 'id, [month+scope], category'
        }).upgrade(async (tx) => {
            // Migrate existing RecurringExpense records
            const expenses = await tx.table('recurringExpenses').toArray();

            for (const expense of expenses) {
                // Only migrate if missing new fields
                if (!expense.frequency || !expense.nextDueDate) {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = today.getMonth();

                    // Calculate nextDueDate from dueDay
                    const nextDue = new Date(year, month, expense.dueDay);
                    if (nextDue < today) {
                        // If already passed this month, use next month
                        nextDue.setMonth(month + 1);
                    }

                    // Update with new fields while keeping ALL existing data
                    await tx.table('recurringExpenses').update(expense.id, {
                        frequency: 'MONTHLY',  // Default to monthly
                        startDate: `${year}-01-01`,  // Start of current year
                        nextDueDate: nextDue.toISOString().split('T')[0],
                        // endDate remains undefined
                        // dueDay, amount, name, category, etc. are PRESERVED
                    });
                }
            }

            console.log(`✅ Migrated ${expenses.length} recurring expenses to v6`);
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
                this.categories.clear(),
                this.incomeSources.clear(),
                this.recurringExpenses.clear(),
                this.monthlyBudgets.clear()
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
