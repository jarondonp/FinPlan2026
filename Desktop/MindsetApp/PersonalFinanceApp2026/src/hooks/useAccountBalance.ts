import { useFirestore } from './useFirestore';
import { Account, Transaction } from '../types';

export interface AccountWithDynamicBalance extends Account {
    dynamicBalance: number;
}

export const useAccountBalance = (scope: 'PERSONAL' | 'BUSINESS') => {
    // 1. Fetch Accounts from Firestore
    const { data: accountsRaw } = useFirestore<Account>('accounts');
    const accounts = accountsRaw || [];

    // 2. Fetch All Transactions from Firestore
    // Note: In a real app we might want to paginate or filter by date, but logic below requires ALL history for balance.
    const { data: transactionsRaw } = useFirestore<Transaction>('transactions');
    const transactions = transactionsRaw || [];

    // 3. Calculate Dynamic Balance for each account
    const accountsWithBalance: AccountWithDynamicBalance[] = accounts.map(acc => {
        // Filter transactions for this specific account
        const accountTxs = transactions.filter(t => t.account_id === acc.id);

        // Sum all transactions (Income + Expense + Transfers)
        const netFlow = accountTxs.reduce((sum, t) => sum + t.amount, 0);

        // Dynamic Balance = Anchor (Initial) + Net Flow
        const dynamicBalance = (acc.balance || 0) + netFlow;

        return {
            ...acc,
            dynamicBalance
        };
    });

    // Filter by scope if needed (though UI usually handles filtering of the Result, fetching all is safer for "All Accounts" views)
    // The previous implementation didn't filter source data, it filtered logic downstream.
    // However, Dashboard calls this with 'scope' argument.
    // If scope is 'PERSONAL', should we return Business accounts?
    // The previous code returned everything and Dashboard filtered. 
    // Wait, previous code:
    // const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
    // It fetched ALL.
    // So we return ALL here too.

    return accountsWithBalance;
};
