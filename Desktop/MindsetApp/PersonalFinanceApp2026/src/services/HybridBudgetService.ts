import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Scope, RecurringExpense, MonthlyBudget, CategoryDef, IncomeSource, Account } from '../types';
import { generateId } from '../utils';
import { calculateSmartReserveForExpense, calculateGoalQuota } from '../utils/subscriptionHelpers';
import { debtService } from './DebtService';
import { Goal } from '../types';

// ... (existing interfaces)

// ... (existing helper)

export interface CategoryBudgetBreakdown {
    category: string;
    fixed: number;      // From Recurring Expenses (Recurrentes)
    reserved: number;   // From Smart Reserves (Reservas)
    variable: number;   // From MonthlyBudget.assigned (Manual)
    totalLimit: number; // Sum of the above
    spent: number;      // Actual spending from transactions
    reservationNotice?: string; // e.g. "Inicia en Marzo de 2026"
    details: {
        fixed: BudgetDetailItem[];
        reserved: BudgetDetailItem[];
        variable: BudgetDetailItem[];
    };
}

export interface BudgetDetailItem {
    id: string;
    name: string;
    amount: number;
    notice?: string;
}

const isRecurringActiveInMonth = (expense: RecurringExpense, month: Date): boolean => {
    return expense.active;
};

export const hybridBudgetService = {

    // Core function to get the breakdown for ALL categories
    async getBudgetBreakdown(month: Date, scope: Scope): Promise<CategoryBudgetBreakdown[]> {
        const user = auth.currentUser;
        if (!user) return [];

        const monthStr = month.toISOString().slice(0, 7); // YYYY-MM
        const breakdown = new Map<string, CategoryBudgetBreakdown>();

        // Helper to check scope (Legacy support: undefined scope == PERSONAL)
        const isInScope = (itemScope?: string) => {
            if (scope === 'PERSONAL') return !itemScope || itemScope === 'PERSONAL';
            return itemScope === scope;
        };

        // 1. Fetch ALL Categories (filtering in memory for legacy support)
        const categoriesSnap = await getDocs(collection(db, 'users', user.uid, 'categories'));
        const categories = categoriesSnap.docs
            .map(d => d.data() as CategoryDef)
            .filter(cat => isInScope(cat.scope));

        // Initialize Map
        categories.forEach(cat => {
            breakdown.set(cat.name, {
                category: cat.name,
                fixed: 0,
                reserved: 0,
                variable: 0,
                totalLimit: 0,
                spent: 0,
                details: {
                    fixed: [],
                    reserved: [],
                    variable: []
                }
            });
        });

        // --- NEW: INJECT DEBT SERVICE CATEGORY ---
        // Fetch Accounts (for balances/mins) and Debt Settings (for extra payment)
        // We do this parallel to recurring expenses to save time, or just sequential.

        try {
            const [accountsSnap, debtSettings] = await Promise.all([
                getDocs(collection(db, 'users', user.uid, 'accounts')),
                debtService.getDebtSettings(user.uid)
            ]);

            const debtAccounts = accountsSnap.docs
                .map(d => d.data() as Account)
                .filter(a => (a.type === 'Credit Card' || a.type === 'Loan') && Math.abs(a.balance) > 1);

            if (debtAccounts.length > 0) {
                // Calculate Total Monthly Commitment
                const totalMin = debtAccounts.reduce((sum, a) => sum + (a.minPayment || Math.abs(a.balance) * 0.02), 0);
                const totalDebtService = totalMin + debtSettings.extraPayment;

                // Create Virtual Category
                const debtCategoryName = "Servicio de Deuda";
                breakdown.set(debtCategoryName, {
                    category: debtCategoryName,
                    fixed: totalDebtService, // It's a FIXED commitment
                    reserved: 0,
                    variable: 0,
                    totalLimit: totalDebtService,
                    spent: 0, // We will fill this later by checking transactions or DebtService status
                    details: {
                        fixed: [
                            { id: 'min_total', name: 'Mínimos Obligatorios', amount: totalMin },
                            { id: 'extra_pament', name: 'Estrategia Aceleradora', amount: debtSettings.extraPayment }
                        ],
                        reserved: [],
                        variable: []
                    }
                });

                // Ideally we should also fetch actual payments made to debit against this category.
                // For now, let's leave 'spent' as 0 or implement a quick check if needed.
                // The 'Debt Command Center' tracks this. The Budget view just reserves the money.
                // If we want the bar to fill, we need to sum payments.
                // Use debtService logic to get actual payments?
                const paymentStatus = await debtService.fetchActualPayments(user.uid, monthStr, debtAccounts.map(a => a.id));
                let totalPaid = 0;
                paymentStatus.forEach(val => totalPaid += val);

                const debtEntry = breakdown.get(debtCategoryName)!;
                debtEntry.spent = totalPaid;
            }
        } catch (error) {
            console.error("Error calculating debt service for budget:", error);
        }
        // -----------------------------------------

        // 2. Fetch ALL Recurring Expenses (filtering in memory)
        const recurringSnap = await getDocs(collection(db, 'users', user.uid, 'recurringExpenses'));
        const recurring = recurringSnap.docs
            .map(d => d.data() as RecurringExpense)
            .filter(r => isInScope(r.scope));

        recurring.forEach(r => {
            if (!breakdown.has(r.category)) return;

            // Is it a Smart Reserve?
            // Is it a Smart Reserve?
            if (r.reservation?.isEnabled) {
                const target = r.reservation.targetAmount || r.amount;
                const saved = r.reservation.initialSaved || 0;

                // Parse Dates
                const startDate = new Date(r.reservation.startDate + 'T00:00:00'); // Ensure local/midnight
                const nextDueDate = new Date(r.nextDueDate + 'T00:00:00');

                // Current Budget Month (First day of month)
                const currentBudgetMonth = new Date(month.getFullYear(), month.getMonth(), 1);
                // Start Date Month (First day of month)
                const startMonthDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

                // Check 1: Have we reached the start date?
                if (currentBudgetMonth < startMonthDate) {
                    const entry = breakdown.get(r.category)!;
                    const startStr = startDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                    const formattedStr = startStr.charAt(0).toUpperCase() + startStr.slice(1);

                    entry.reservationNotice = `Inicia en ${formattedStr}`; // Main category notice (legacy/simple)
                    entry.details.reserved.push({
                        id: r.id,
                        name: r.name,
                        amount: 0,
                        notice: `Inicia en ${formattedStr}`
                    });
                } else {
                    // Active Phase (Catch-up Logic)
                    const diffTime = nextDueDate.getTime() - currentBudgetMonth.getTime();
                    let monthsRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)));
                    if (diffTime <= 0) monthsRemaining = 1;

                    const monthlyQuota = (target - saved) / monthsRemaining;

                    const entry = breakdown.get(r.category)!;
                    entry.reserved += monthlyQuota;
                    entry.details.reserved.push({
                        id: r.id,
                        name: r.name,
                        amount: monthlyQuota,
                        notice: `Meta: $${target} (${monthsRemaining} m)`
                    });
                }
            } else {
                // Regular Fixed Expense
                if (isRecurringActiveInMonth(r, month)) {
                    const entry = breakdown.get(r.category)!;
                    entry.fixed += r.amount;
                    entry.details.fixed.push({
                        id: r.id,
                        name: r.name,
                        amount: r.amount
                    });
                }
            }
        });

        // 3. Fetch Manual Variable Budget (from monthly_budgets)
        // STRATEGY: Try to fetch the Monolithic Document for this Scope + Month first.
        // This is the formatted ID: [SCOPE]_[YYYY-MM]
        const budgetDocId = `${scope}_${monthStr}`;
        try {
            const budgetDocRef = doc(db, 'users', user.uid, 'monthly_budgets', budgetDocId);
            const budgetDocSnap = await getDocs(query(collection(db, 'users', user.uid, 'monthly_budgets'), where('month', '==', monthStr)));
            // Note: We check both the specific new ID format AND legacy individual docs if needed. 
            // For now, let's prioritize the new monolithic structure used by BudgetModule.

            // A. Check specific monolithic doc (Direct Read)
            const exactDocSnap = await import('firebase/firestore').then(mod => mod.getDoc(budgetDocRef));

            if (exactDocSnap.exists()) {
                const data = exactDocSnap.data();
                if (data.categories) {
                    Object.entries(data.categories).forEach(([catName, catData]: [string, any]) => {
                        if (breakdown.has(catName)) {
                            const entry = breakdown.get(catName)!;

                            // Update total variable amount
                            entry.variable = catData.variable || 0;
                            // Update details if present
                            if (catData.details?.variable && Array.isArray(catData.details.variable)) {
                                entry.details.variable = catData.details.variable;
                            } else if (entry.variable > 0) {
                                // Fallback for data without details
                                entry.details.variable.push({
                                    id: 'manual_legacy',
                                    name: 'Asignación Manual',
                                    amount: entry.variable
                                });
                            }
                        }
                    });
                }
            } else {
                // B. Fallback: Query collection for documents matching the month (Legacy behavior)
                // This handles cases where data might be stored as individual docs or different IDs.
                const budgetSnap = await getDocs(query(
                    collection(db, 'users', user.uid, 'monthly_budgets'),
                    where('month', '==', monthStr)
                ));

                budgetSnap.docs
                    .map(d => d.data() as MonthlyBudget)
                    .filter(b => isInScope(b.scope))
                    .forEach(b => {
                        if (breakdown.has(b.category)) {
                            const entry = breakdown.get(b.category)!;
                            entry.variable = b.assigned;

                            const storedDetails = (b as any).details?.variable as BudgetDetailItem[];
                            if (storedDetails && Array.isArray(storedDetails) && storedDetails.length > 0) {
                                entry.details.variable = storedDetails;
                            } else if (b.assigned > 0) {
                                entry.details.variable.push({
                                    id: b.id,
                                    name: 'Asignación Manual',
                                    amount: b.assigned
                                });
                            }
                        }
                    });
            }
        } catch (e) {
            console.error("Error fetching monthly budget:", e);
        }

        // --- NEW: INJECT SAVINGS GOALS ---
        try {
            const goalsSnap = await getDocs(collection(db, 'users', user.uid, 'goals'));
            const allGoals = goalsSnap.docs
                .map(d => d.data() as Goal)
                .filter(g => isInScope(g.scope));

            // Filter goals that are active in this month
            // A goal is active if its startDate is <= current month
            const currentYear = month.getFullYear();
            const currentMonth = month.getMonth(); // 0-indexed (0 = January, 1 = February, etc.)

            const monthGoals = allGoals.filter(g => {
                if (!g.startDate) return true; // Legacy goals without startDate are always active

                const goalStart = new Date(g.startDate + 'T00:00:00');
                // Goal is active if it starts on or before the current month
                return goalStart.getFullYear() < currentYear ||
                    (goalStart.getFullYear() === currentYear && goalStart.getMonth() <= currentMonth);
            });

            if (monthGoals.length > 0) {
                const savingsCategoryName = "Metas de Patrimonio";
                const savingsItems: BudgetDetailItem[] = [];
                let totalSavingsQuota = 0;

                monthGoals.forEach(g => {
                    const quota = calculateGoalQuota(g);
                    if (quota > 0) {
                        totalSavingsQuota += quota;
                        savingsItems.push({
                            id: g.id,
                            name: g.name,
                            amount: quota,
                            notice: (g.targetDate || g.deadline) ? `Hasta ${new Date(g.targetDate || g.deadline).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}` : 'Cuota fija'
                        });
                    }
                });

                if (totalSavingsQuota > 0) {
                    breakdown.set(savingsCategoryName, {
                        category: savingsCategoryName,
                        fixed: 0,
                        reserved: totalSavingsQuota,
                        variable: 0,
                        totalLimit: totalSavingsQuota,
                        spent: 0,
                        details: {
                            fixed: [],
                            reserved: savingsItems,
                            variable: []
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Error calculating savings goals for budget:", error);
        }

        // 4. Fetch Actual Spending (Spent)
        const startStr = `${monthStr}-01`;
        const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const endStr = `${monthStr}-${lastDay}`;

        const txSnap = await getDocs(query(
            collection(db, 'users', user.uid, 'transactions'),
            where('date', '>=', startStr),
            where('date', '<=', endStr)
        ));

        txSnap.docs
            .map(d => d.data())
            .filter(tx => {
                const scopeMatch = isInScope(tx.scope);
                const typeMatch = tx.type === 'EXPENSE';
                return scopeMatch && typeMatch;
            })
            .forEach(tx => {
                if (breakdown.has(tx.category)) {
                    breakdown.get(tx.category)!.spent += tx.amount;
                }
            });

        // 5. Calculate Totals
        const results = Array.from(breakdown.values()).map(item => ({
            ...item,
            totalLimit: item.fixed + item.reserved + item.variable
        }));

        return results.sort((a, b) => b.totalLimit - a.totalLimit);
    },

    // Update the Variable portion
    async setVariableBudget(month: Date, category: string, scope: Scope, amount: number) {
        const user = auth.currentUser;
        if (!user) return;

        const monthStr = month.toISOString().slice(0, 7);
        const q = query(
            collection(db, 'users', user.uid, 'monthly_budgets'),
            where('month', '==', monthStr),
            where('scope', '==', scope),
            where('category', '==', category)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const docRef = doc(db, 'users', user.uid, 'monthly_budgets', snapshot.docs[0].id);
            await updateDoc(docRef, { assigned: amount });
        } else {
            const newItem: MonthlyBudget = {
                id: generateId(),
                month: monthStr,
                category,
                scope,
                assigned: amount, // Represents VARIABLE portion
                spent: 0
            };
            await setDoc(doc(db, 'users', user.uid, 'monthly_budgets', newItem.id), newItem);
        }
    },

    async getProjectedIncome(month: Date, scope: Scope): Promise<number> {
        const user = auth.currentUser;
        if (!user) return 0;

        const snap = await getDocs(query(
            collection(db, 'users', user.uid, 'incomeSources'),
            where('scope', '==', scope)
        ));

        const sources = snap.docs.map(d => d.data() as IncomeSource);
        let total = 0;

        sources.forEach(src => {
            if (src.frequency === 'MONTHLY') {
                total += src.amount;
            } else if (src.frequency === 'BIWEEKLY') {
                total += (src.amount * 2);
            }
        });

        return total;
    }
};
