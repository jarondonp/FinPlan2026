import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Account } from '../types';

export interface AccountWithDynamicBalance extends Account {
    dynamicBalance: number;
}

export const useAccountBalance = (scope: 'PERSONAL' | 'BUSINESS') => {
    // 1. Fetch Accounts
    const accounts = useLiveQuery(() => db.accounts
        .filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope))
        .toArray(), [scope]) || [];

    // 2. Fetch All Transactions for these accounts
    // optimization: purely for balance calculation, we need all verified/provisional txs
    const transactions = useLiveQuery(() => db.transactions
        .filter(t => t.scope === scope || (scope === 'PERSONAL' && !t.scope))
        .toArray(), [scope]) || [];

    // 3. Calculate Dynamic Balance for each account
    const accountsWithBalance: AccountWithDynamicBalance[] = accounts.map(acc => {
        const accountTxs = transactions.filter(t => t.account_id === acc.id);

        // Sum all transactions (Income + Expense + Transfers)
        const netFlow = accountTxs.reduce((sum, t) => sum + t.amount, 0);

        // Dynamic Balance = Anchor (Initial) + Net Flow
        // Credit Cards balances are usually stored as positive debt in User mental model, 
        // but in this system:
        // - Assets (Checking): Positive Balance.
        // - Liabilities (CC): Negative Balance usually? 
        // Let's stick to the convention: Balance is signed number.
        // If CC has balance -500 (Debt), and I spend -100, it becomes -600.

        const dynamicBalance = (acc.balance || 0) + netFlow;

        return {
            ...acc,
            dynamicBalance
        };
    });

    return accountsWithBalance;
};
