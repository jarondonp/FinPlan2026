import { useFirestore } from './useFirestore';
import { Account, Transaction, IncomeSource, RecurringExpense } from '../types';

export interface AccountWithDynamicBalance extends Account {
    dynamicBalance: number;
}

/**
 * Hook to calculate account balances.
 * If toDate is provided, it calculates the balance as of that date.
 * - For past dates: sum of transactions up to that date.
 * - For future dates: sum of transactions + projected flow from recurring items.
 */
export const useAccountBalance = (scope: 'PERSONAL' | 'BUSINESS', toDate?: Date) => {
    // 1. Fetch Data
    const { data: accountsRaw } = useFirestore<Account>('accounts');
    const { data: transactionsRaw } = useFirestore<Transaction>('transactions');
    const { data: incomesRaw } = useFirestore<IncomeSource>('incomeSources');
    const { data: recurringRaw } = useFirestore<RecurringExpense>('recurringExpenses');

    const accounts = (accountsRaw || []).filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope));
    const transactions = (transactionsRaw || []).filter(t => t.scope === scope || (scope === 'PERSONAL' && !t.scope));
    const incomes = (incomesRaw || []).filter(i => i.scope === scope || (scope === 'PERSONAL' && !i.scope));
    const recurring = (recurringRaw || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

    // 2. Calculate balance for each account
    const accountsWithBalance: AccountWithDynamicBalance[] = accounts.map(acc => {
        // A. Confirmed Transactions
        const accountTxs = transactions.filter(t => {
            if (t.account_id !== acc.id) return false;

            if (toDate) {
                // Parse date safely (Local Time)
                const parts = t.date.split('-');
                const txDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                return txDate <= toDate;
            }
            return true;
        });

        const confirmedNetFlow = accountTxs.reduce((sum, t) => sum + t.amount, 0);
        let dynamicBalance = (acc.balance || 0) + confirmedNetFlow;

        // B. Projections (Only if toDate is in the future)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (toDate && toDate > today) {
            // Calculate months between today and toDate for estimation
            const monthsDiff = (toDate.getFullYear() - today.getFullYear()) * 12 + (toDate.getMonth() - today.getMonth());

            if (monthsDiff > 0) {
                // 1. Projected Income linked to this account
                const projectedIncome = incomes
                    .filter(i => i.account_id === acc.id)
                    .reduce((sum, i) => {
                        const monthlyAmount = i.frequency === 'BIWEEKLY' ? i.amount * 2 : i.amount;
                        return sum + (monthlyAmount * monthsDiff);
                    }, 0);

                // 2. Projected Expenses linked to this account
                const projectedExpenses = recurring
                    .filter(r => r.active && r.account_id === acc.id)
                    .reduce((sum, r) => {
                        let monthlyImpact = 0;
                        if (r.frequency === 'MONTHLY') monthlyImpact = r.amount;
                        else if (r.frequency === 'QUARTERLY') monthlyImpact = r.amount / 3;
                        else if (r.frequency === 'SEMI_ANNUAL') monthlyImpact = r.amount / 6;
                        else if (r.frequency === 'ANNUAL') monthlyImpact = r.amount / 12;

                        return sum + (monthlyImpact * monthsDiff);
                    }, 0);

                dynamicBalance += (projectedIncome - projectedExpenses);
            }
        }

        return {
            ...acc,
            dynamicBalance
        };
    });

    return accountsWithBalance;
};
