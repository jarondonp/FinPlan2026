import { db } from '../db/db';
import { MonthlyClosingStatus, MonthlyClosing, Scope, Transaction } from '../types';
import { getStartOfMonth, formatMonth, generateId } from '../utils';
import { budgetService } from './BudgetService';

// Helper to get safe YYYY-MM from local date
const getMonthKey = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-based
    return `${year}-${month.toString().padStart(2, '0')}`;
};

export const closingService = {
    // 1. Get Status
    async getStatus(month: Date, scope: Scope): Promise<MonthlyClosingStatus> {
        const monthStr = getMonthKey(month);
        const id = `${monthStr}-${scope}`;

        const record = await db.monthlyClosings.get(id);
        return record ? record.status : 'OPEN';
    },

    // 2. Check if Month Can Be Closed
    async canClose(month: Date, scope: Scope): Promise<{ allowed: boolean, reason?: string }> {
        // Rule: Strict Genesis Date = Dec 1, 2025 (Use Start of day)
        const GENESIS_TIMESTAMP = new Date(2025, 11, 1).setHours(0, 0, 0, 0);
        const currentTimestamp = new Date(month.getFullYear(), month.getMonth(), 1).setHours(0, 0, 0, 0);

        // 1. If trying to close before Genesis, Block.
        if (currentTimestamp < GENESIS_TIMESTAMP) {
            return { allowed: false, reason: "Este mes es anterior al inicio del sistema (Dic 2025)." };
        }

        // 1.5. Check Budget Health (Phase 6)
        // We do this check for ANY month, even Genesis. You can't close if you have red categories.
        const health = await budgetService.getBudgetHealth(month, scope);
        if (health.hasOverspent) {
            return {
                allowed: false,
                reason: `Presupuesto en Rojo: Tienes ${health.overspentCategories.length} categorías con saldo negativo. Debes cubrir los sobregiros antes de cerrar.`
            };
        }

        // 2. If it is Genesis month, Allow (no previous check needed).
        if (currentTimestamp === GENESIS_TIMESTAMP) {
            return { allowed: true };
        }

        // 3. For any other month, Previous Month MUST be Closed/Locked.
        const prevMonthDate = new Date(month.getFullYear(), month.getMonth() - 1, 1);
        const prevMonthStr = getMonthKey(prevMonthDate);
        const prevId = `${prevMonthStr}-${scope}`;
        const prevRecord = await db.monthlyClosings.get(prevId);

        if (!prevRecord || prevRecord.status === 'OPEN') {
            return {
                allowed: false,
                reason: `No puedes cerrar ${formatMonth(month)} porque el mes anterior (${formatMonth(prevMonthDate)}) sigue abierto. Debes cerrar los meses en orden secuencial.`
            };
        }

        return { allowed: true };
    },

    // 3. Close Month
    async closeMonth(month: Date, scope: Scope, notes: string = ""): Promise<void> {
        const monthStr = getMonthKey(month);
        const id = `${monthStr}-${scope}`;

        // Double check permission
        const check = await this.canClose(month, scope);
        if (!check.allowed) throw new Error(check.reason);

        // Security Snapshot
        const snapshot = {
            finalAssets: 0,
            finalLiabilities: 0,
            finalNetWorth: 0
        };

        const closingRecord: MonthlyClosing = {
            id,
            monthStr,
            scope,
            status: 'LOCKED', // We jump directly to locked for this version for simplicity
            closedAt: new Date().toISOString(),
            notes,
            ...snapshot
        };

        await db.monthlyClosings.put(closingRecord);
    },

    // 4. Reopen Month (Admin feature to fix mistakes)
    async reopenMonth(month: Date, scope: Scope): Promise<void> {
        // Only allow reopening if the NEXT month is NOT closed. 
        const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        const nextMonthStr = getMonthKey(nextMonth);
        const nextId = `${nextMonthStr}-${scope}`;

        const nextRecord = await db.monthlyClosings.get(nextId);
        if (nextRecord && nextRecord.status !== 'OPEN') {
            throw new Error(`No puedes reabrir ${formatMonth(month)} porque el mes siguiente (${formatMonth(nextMonth)}) ya está cerrado. Debes reabrir los meses futuros primero.`);
        }

        const monthStr = getMonthKey(month);
        const id = `${monthStr}-${scope}`;

        await db.monthlyClosings.update(id, { status: 'OPEN' });
    },

    async isTransactionEditable(date: Date, scope: Scope): Promise<boolean> {
        const status = await this.getStatus(date, scope);
        return status === 'OPEN';
    },

    // 6. Get Account Balance for Verification
    async getAccountBalance(accountId: string, dateLimit: Date): Promise<number> {
        // String comparison YYYY-MM-DD
        const limitStr = dateLimit.toISOString().split('T')[0];

        const txs = await db.transactions
            .where('account_id').equals(accountId)
            .filter(t => t.date <= limitStr)
            .toArray();

        const account = await db.accounts.get(accountId);
        const initialBalance = account?.balance || 0;

        return initialBalance + txs.reduce((sum, t) => sum + t.amount, 0);
    },

    // 7. Create Adjustment
    async createBalanceAdjustment(accountId: string, difference: number, date: Date, scope: Scope): Promise<void> {
        const adjustment: Transaction = {
            id: generateId(),
            date: date.toISOString().split('T')[0],
            amount: difference,
            description_original: "Ajuste Automático de Cierre",
            description_normalized: "Ajuste de Balance",
            category: "Ajustes", // Ensure this category exists or is treated specially
            type: "ADJUSTMENT",
            status: "ADJUSTMENT",
            account_id: accountId,
            scope: scope,
            is_duplicate: false,
            needs_review: false
        };
        await db.transactions.add(adjustment);
    },

    // 8. Reconstruct Initial Balance (Genesis Month - Engineering Reverse)
    async reconstructInitialBalance(accountId: string, finalBalance: number, dateLimit: Date): Promise<void> {
        // A. Calculate Net Flow for the month (Income - Expenses) considering transactions BEFORE the split
        // Actually, for genesis, we take ALL transactions up to that date.

        const limitStr = dateLimit.toISOString().split('T')[0];
        const txs = await db.transactions
            .where('account_id').equals(accountId)
            .filter(t => t.date <= limitStr)
            .toArray();

        // B. Calculate Net Flow
        const netFlow = txs.reduce((sum, t) => sum + t.amount, 0);

        // C. Calculate Required Initial Balance
        // Formula: Final = Initial + NetFlow
        // Therefore: Initial = Final - NetFlow
        const newInitialBalance = finalBalance - netFlow;

        // D. Update Account
        await db.accounts.update(accountId, { balance: newInitialBalance });
    }
};
