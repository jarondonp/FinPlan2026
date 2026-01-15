import { db, auth } from '../firebase/config';
import { collection, doc, getDoc, getDocs, setDoc, query, where, updateDoc } from 'firebase/firestore';
import { MonthlyClosingStatus, MonthlyClosing, Scope, Transaction } from '../types';
import { getStartOfMonth, formatMonth, generateId } from '../utils';
import { budgetService } from './BudgetService';

// Helper to get safe YYYY-MM from local date
const getMonthKey = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-based
    return `${year}-${month.toString().padStart(2, '0')}`;
};

// Helper: Get current user UID safely
const getUid = () => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated for ClosingService");
    return user.uid;
};

export const closingService = {
    // 1. Get Status
    async getStatus(month: Date, scope: Scope): Promise<MonthlyClosingStatus> {
        try {
            const user = auth.currentUser;
            if (!user) return 'OPEN';

            const monthStr = getMonthKey(month);
            // ID format: YYYY-MM-SCOPE. Ideally should be unique per user.
            // Using a subcollection: users/{uid}/monthlyClosings/{YYYY-MM-SCOPE}
            const id = `${monthStr}-${scope}`;

            const docRef = doc(db, 'users', user.uid, 'monthlyClosings', id);
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                const data = snapshot.data() as MonthlyClosing;
                return data.status;
            }
            return 'OPEN';
        } catch (e) {
            console.error("Error getting closing status", e);
            return 'OPEN';
        }
    },

    // 2. Check if Month Can Be Closed
    async canClose(month: Date, scope: Scope): Promise<{ allowed: boolean, reason?: string }> {
        const uid = getUid();

        // Rule: Strict Genesis Date = Dec 1, 2025 (Use Start of day)
        const GENESIS_TIMESTAMP = new Date(2025, 11, 1).setHours(0, 0, 0, 0);
        const currentTimestamp = new Date(month.getFullYear(), month.getMonth(), 1).setHours(0, 0, 0, 0);

        // 1. If trying to close before Genesis, Block.
        if (currentTimestamp < GENESIS_TIMESTAMP) {
            return { allowed: false, reason: "Este mes es anterior al inicio del sistema (Dic 2025)." };
        }

        // 1.5. Check Budget Health (Phase 6)
        // We do this check for ANY month, even Genesis. You can't close if you have red categories.
        // budgetService needs to be refactored too to support firestore or we fetch here.
        // Assuming budgetService is updated or we skip for now to avoid circular dep lock if budgetService uses closingService.
        // Let's assume budgetService acts on cloud data.
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

        const docRef = doc(db, 'users', uid, 'monthlyClosings', prevId);
        const prevSnap = await getDoc(docRef);
        const prevRecord = prevSnap.data() as MonthlyClosing | undefined;

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
        const uid = getUid();
        const monthStr = getMonthKey(month);
        const id = `${monthStr}-${scope}`;

        // Double check permission
        const check = await this.canClose(month, scope);
        if (!check.allowed) throw new Error(check.reason);

        // Security Snapshot (Placeholder for now)
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

        await setDoc(doc(db, 'users', uid, 'monthlyClosings', id), closingRecord);
    },

    // 4. Reopen Month (Admin feature to fix mistakes)
    async reopenMonth(month: Date, scope: Scope): Promise<void> {
        const uid = getUid();

        // Only allow reopening if the NEXT month is NOT closed. 
        const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        const nextMonthStr = getMonthKey(nextMonth);
        const nextId = `${nextMonthStr}-${scope}`;

        const nextRef = doc(db, 'users', uid, 'monthlyClosings', nextId);
        const nextSnap = await getDoc(nextRef);
        const nextRecord = nextSnap.data() as MonthlyClosing | undefined;

        if (nextRecord && nextRecord.status !== 'OPEN') {
            throw new Error(`No puedes reabrir ${formatMonth(month)} porque el mes siguiente (${formatMonth(nextMonth)}) ya está cerrado. Debes reabrir los meses futuros primero.`);
        }

        const monthStr = getMonthKey(month);
        const id = `${monthStr}-${scope}`;

        await updateDoc(doc(db, 'users', uid, 'monthlyClosings', id), { status: 'OPEN' });
    },

    async isTransactionEditable(date: Date, scope: Scope): Promise<boolean> {
        const status = await this.getStatus(date, scope);
        return status === 'OPEN';
    },

    // 6. Get Account Balance for Verification
    async getAccountBalance(accountId: string, dateLimit: Date): Promise<number> {
        const uid = getUid();
        // String comparison YYYY-MM-DD
        const limitStr = dateLimit.toISOString().split('T')[0];

        const q = query(
            collection(db, 'users', uid, 'transactions'),
            where('account_id', '==', accountId)
            // Note: Firestore string comparison works for ISO dates
            , where('date', '<=', limitStr)
        );
        const querySnapshot = await getDocs(q);
        const txs = querySnapshot.docs.map(d => d.data() as Transaction);

        const accountRef = doc(db, 'users', uid, 'accounts', accountId);
        const accountSnap = await getDoc(accountRef);
        const account = accountSnap.data();
        const initialBalance = account?.balance || 0;

        return initialBalance + txs.reduce((sum, t) => sum + t.amount, 0);
    },

    // 7. Create Adjustment
    async createBalanceAdjustment(accountId: string, difference: number, date: Date, scope: Scope): Promise<void> {
        const uid = getUid();
        const id = generateId();
        const adjustment: Transaction = {
            id,
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
        await setDoc(doc(db, 'users', uid, 'transactions', id), adjustment);
    },

    // 8. Reconstruct Initial Balance (Genesis Month - Engineering Reverse)
    async reconstructInitialBalance(accountId: string, finalBalance: number, dateLimit: Date): Promise<void> {
        const uid = getUid();
        const limitStr = dateLimit.toISOString().split('T')[0];

        const q = query(
            collection(db, 'users', uid, 'transactions'),
            where('account_id', '==', accountId),
            where('date', '<=', limitStr)
        );
        const snapshot = await getDocs(q);
        const txs = snapshot.docs.map(d => d.data() as Transaction);

        // B. Calculate Net Flow
        const netFlow = txs.reduce((sum, t) => sum + t.amount, 0);

        // C. Calculate Required Initial Balance
        // Formula: Final = Initial + NetFlow
        // Therefore: Initial = Final - NetFlow
        const newInitialBalance = finalBalance - netFlow;

        // D. Update Account
        await updateDoc(doc(db, 'users', uid, 'accounts', accountId), { balance: newInitialBalance });
    }
};
