import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Account } from '../types';

export interface AccountWithDynamicBalance extends Account {
    dynamicBalance: number;
}

export const useAccountBalance = (scope: 'PERSONAL' | 'BUSINESS') => {
    // 1. Fetch Accounts (NUCLEAR OPTION: NO FILTER)
    const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];

    // 2. Fetch All Transactions (NUCLEAR OPTION: NO FILTER)
    const transactions = useLiveQuery(() => db.transactions.toArray(), []) || [];

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
