import { db } from '../db/db';
import { MonthStatus, MonthlyClosing, Scope } from '../types';
import { getStartOfMonth, formatMonth } from '../utils';

// Helper to get safe YYYY-MM from local date
const getMonthKey = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-based
    return `${year}-${month.toString().padStart(2, '0')}`;
};

export const closingService = {
    // 1. Get Status
    async getStatus(month: Date, scope: Scope): Promise<MonthStatus> {
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

    // 5. Check if a transaction date is editable
    async isTransactionEditable(date: Date, scope: Scope): Promise<boolean> {
        const status = await this.getStatus(date, scope);
        return status === 'OPEN';
    }
};
