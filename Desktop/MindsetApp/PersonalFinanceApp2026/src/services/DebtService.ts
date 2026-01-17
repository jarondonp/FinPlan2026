import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { Account, Transaction } from '../types';

export type DebtStrategy = 'AVALANCHE' | 'SNOWBALL';

export interface DebtSettings {
    extraPayment: number;
    strategy: DebtStrategy;
    manualAllocations?: { [accountId: string]: number };
}

export interface PaymentPlanItem {
    accountId: string;
    accountName: string;
    currentBalance: string;
    minPayment: number;
    extraAllocation: number;
    totalSuggested: number;
    paidSoFar: number;
    remaining: number;
    isFullyPaid: boolean;
    isLocked?: boolean;
    apr?: number;
}

export const debtService = {
    /**
     * Calculates the suggested payment plan based on strategy and available budget.
     */
    calculatePaymentPlan(
        accounts: Account[],
        totalBudget: number, // Total money available for debt (Mins + Extra)
        strategy: DebtStrategy,
        manualAllocations: { [key: string]: number } = {}
    ): PaymentPlanItem[] {
        // 1. Filter active debts
        const debts = accounts.filter(a =>
            (a.type === 'Credit Card' || a.type === 'Loan') &&
            Math.abs(a.balance) > 1 // Filter out negligible balances
        );

        if (debts.length === 0) return [];

        // 2. Calculate Totals and Minimums
        const plan: PaymentPlanItem[] = debts.map(a => {
            // CRITICAL FIX: Use dynamicBalance (Calculated) if available, otherwise fallback to balance (Anchor)
            // This ensures the service sees the same "Current Balance" as the UI.
            const rawBalance = 'dynamicBalance' in a ? (a as any).dynamicBalance : a.balance;
            const balance = Math.abs(rawBalance);

            const calculatedMin = a.minPayment || (balance * 0.02);

            // CRITICAL: Minimum can NEVER exceed the actual debt
            // If you owe $30, max payment is $30, not $41
            const minPayment = Math.min(calculatedMin, balance);

            return {
                accountId: a.id,
                accountName: a.name,
                currentBalance: balance.toString(),
                minPayment: minPayment,
                extraAllocation: 0,
                totalSuggested: 0,
                paidSoFar: 0,
                remaining: 0,
                isFullyPaid: false,
                isLocked: false,
                apr: a.apr || 0
            };
        });

        const totalMinRequired = plan.reduce((sum, item) => sum + item.minPayment, 0);
        let availableForExtra = Math.max(0, totalBudget - totalMinRequired);

        // 3. Assign Minimums First
        plan.forEach(item => {
            item.totalSuggested = item.minPayment;
        });

        // 4. Apply Manual Allocations (Locks)
        Object.entries(manualAllocations).forEach(([accId, amount]) => {
            // CRITICAL: Only lock if user actually requested money (> 0)
            // If amount is 0, skip completely and let auto-distribution handle it
            if (amount < 0.01) return;

            const item = plan.find(p => p.accountId === accId);
            if (item) {
                const allocated = Math.min(amount, availableForExtra);

                item.extraAllocation = allocated;
                item.totalSuggested += allocated;
                item.isLocked = true;

                availableForExtra -= allocated;
            }
        });

        // 5. Distribute Remaining Extra (Strategy)
        console.log('🔍 DEBUG: availableForExtra =', availableForExtra);
        console.log('🔍 DEBUG: manualAllocations =', manualAllocations);

        if (availableForExtra > 0.01) {
            const targets = plan.filter(p => !p.isLocked);
            console.log('🔍 DEBUG: unlocked targets =', targets.length);

            if (strategy === 'AVALANCHE') {
                targets.sort((a, b) => (b.apr || 0) - (a.apr || 0));
                console.log('🔍 DEBUG: Sorted by APR (highest first)');
            } else {
                targets.sort((a, b) => parseFloat(a.currentBalance) - parseFloat(b.currentBalance));
                console.log('🔍 DEBUG: Sorted by Balance (lowest first)');
            }

            // CRITICAL FIX: Loop through ALL targets, not just the first one
            // Keep allocating until money runs out or all debts are maxed
            for (const target of targets) {
                if (availableForExtra < 0.01) break;

                const currentBalance = parseFloat(target.currentBalance);
                const maxPayable = currentBalance - target.totalSuggested;

                console.log(`🔍 Trying ${target.accountName}, balance=$${currentBalance}, min=$${target.minPayment}, maxPayable=$${maxPayable}`);

                if (maxPayable > 0.01) {
                    const toAllocate = Math.min(availableForExtra, maxPayable);
                    target.extraAllocation += toAllocate;
                    target.totalSuggested += toAllocate;
                    availableForExtra -= toAllocate;

                    console.log(`✅ Allocated $${toAllocate} to ${target.accountName}, remaining=$${availableForExtra}`);
                } else {
                    console.log(`⏭️ Skipping ${target.accountName} (maxed out)`);
                }
            }
        } else {
            console.log('⚠️ No extra funds available for distribution');
        }

        return plan;
    },

    /**
     * Checks actual payments made to these accounts in the current month.
     */
    async getPaymentStatus(userId: string, month: Date, plan: PaymentPlanItem[]): Promise<PaymentPlanItem[]> {
        const startStr = month.toISOString().slice(0, 7) + '-01';
        // Get last day of month
        const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const endStr = month.toISOString().slice(0, 7) + '-' + lastDay;

        // Fetch all expense/transfer transactions for this month related to debt accounts
        // We look for transfers TO the debt account or expenses categorized as 'Debt' (if applicable)
        // Generally, debt payment is a Transfer: Checking -> Credit Card.
        // OR an Expense on the Checking account with category 'Debt Payment'? 
        // Let's assume Transfers to the account match.

        const q = query(
            collection(db, 'users', userId, 'transactions'),
            where('date', '>=', startStr),
            where('date', '<=', endStr),
            where('type', '==', 'TRANSFER')
        );

        const snap = await getDocs(q);
        const transfers = snap.docs.map(d => d.data() as Transaction);

        // Map status
        return plan.map(item => {
            // Find transfers where destination_account_id (or similar logic) matches.
            // In our Transaction model, we need to know the destination.
            // Standard 'TRANSFER' usually implies main account -> logic?
            // Actually, in `Transaction` type we don't strictly have `destination_account_id` visible in the snippet.
            // Let's assume the user categorizes payments as Transfers and the 'account_id' might be the source.
            // We need a way to link it. 
            // For now, let's look for Expenses/Transfers on the Debt Account itself?
            // "Payments" on a CC appear as POSITIVE balance changes (Income/Transfer) OR negative if view is inverted?
            // Typically: Buying creates negative balance. Paying creates positive transaction.

            // Let's query transactions FOR the debt account that are "INCOME" or "TRANSFER" (incoming money).
            return item;
        });
    },

    /**
     * Revised Status Checker: look for Credit/Income on the debt account itself.
     */
    async fetchActualPayments(userId: string, monthStr: string, accountIds: string[]): Promise<Map<string, number>> {
        const paymentMap = new Map<string, number>();
        const startStr = `${monthStr}-01`;
        const lastDay = new Date(parseInt(monthStr.split('-')[0]), parseInt(monthStr.split('-')[1]), 0).getDate();
        const endStr = `${monthStr}-${lastDay}`;

        // For each account, we want to find "Payments".
        // A payment to a credit card is usually a Transaction of type 'INCOME' or 'TRANSFER' (Positive amount)
        // on that specific account.

        // We can optimize by fetching ALL transactions for the period for these accounts.
        // We can optimize by fetching ALL transactions for the period for these accounts.
        const q = query(
            collection(db, 'users', userId, 'transactions'),
            where('date', '>=', startStr),
            where('date', '<=', endStr)
        );

        const snap = await getDocs(q);

        snap.docs.forEach(d => {
            const tx = d.data() as Transaction;

            // Filter by account_id in memory to avoid Composite Index requirement
            if (!accountIds.includes(tx.account_id)) return;

            // Assuming positive amount logic for payments on liability accounts
            if (['INCOME', 'TRANSFER'].includes(tx.type)) {
                const current = paymentMap.get(tx.account_id) || 0;
                paymentMap.set(tx.account_id, current + Math.abs(tx.amount));
            }
        });



        return paymentMap;
    },

    /**
     * Get Debt Configuration (Extra Payment + Strategy)
     */
    async getDebtSettings(userId: string): Promise<DebtSettings> {
        const ref = doc(db, 'users', userId, 'settings', 'debt');
        const snap = await getDoc(ref);
        if (snap.exists()) {
            return snap.data() as DebtSettings;
        }
        return { extraPayment: 0, strategy: 'AVALANCHE' }; // Defaults
    },

    /**
     * Save Debt Configuration
     */
    async saveDebtSettings(userId: string, settings: DebtSettings): Promise<void> {
        const ref = doc(db, 'users', userId, 'settings', 'debt');
        await setDoc(ref, settings);
    }
};
