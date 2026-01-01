import { Transaction } from '../types';

export interface Conflict {
    incoming: Transaction;
    existing: Transaction;
}

export interface ReconciliationResult {
    unique: Transaction[];
    conflicts: Conflict[];
}

/**
 * Generates a simple hash for quick comparison.
 * Note: We don't use description providing strict uniqueness because descriptions change (pending vs posted).
 * We rely on Amount + Date + Account.
 */
export const generateFingerprint = (t: Transaction): string => {
    return `${t.account_id}|${t.amount}|${t.date}`; // Date is YYYY-MM-DD
};

/**
 * Detects conflicts between a list of incoming transactions and existing transactions.
 * Uses a fuzzy date strategy (+/- 1 day) to handle bank posting delays.
 */
export const detectConflicts = (
    incoming: Transaction[],
    existing: Transaction[]
): ReconciliationResult => {
    const conflicts: Conflict[] = [];
    const unique: Transaction[] = [];

    // Index existing for faster lookup by Amount + Account
    // Key: "account_id|amount" -> Value: Transaction[]
    const existingMap = new Map<string, Transaction[]>();

    existing.forEach(t => {
        const key = `${t.account_id}|${t.amount}`;
        if (!existingMap.has(key)) existingMap.set(key, []);
        existingMap.get(key)?.push(t);
    });

    incoming.forEach(inc => {
        const key = `${inc.account_id}|${inc.amount}`;
        const candidates = existingMap.get(key);

        let match: Transaction | undefined;

        if (candidates) {
            // Check Dates
            const incDate = new Date(inc.date + "T00:00:00");

            match = candidates.find(ex => {
                const exDate = new Date(ex.date + "T00:00:00");
                const diffTime = Math.abs(incDate.getTime() - exDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= 2; // Allow +/- 2 days tolerance
            });
        }

        if (match) {
            conflicts.push({
                incoming: inc,
                existing: match // We match against the first found. UX can handle multiple? Keep simple.
            });
        } else {
            unique.push(inc);
        }
    });

    return { unique, conflicts };
};
