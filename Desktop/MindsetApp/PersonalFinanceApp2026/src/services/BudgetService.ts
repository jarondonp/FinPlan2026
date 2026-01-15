import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { Scope, MonthlyBudget, CategoryDef, Transaction } from '../types';
import { generateId } from '../utils';

// Helper to get current User ID
const getUid = () => {
    const user = auth.currentUser;
    if (!user) return null;
    return user.uid;
};

export const budgetService = {
    // Get effective assigned budget for a category in a specific month
    async getBudgetForCategory(month: Date, categoryName: string, scope: Scope): Promise<number> {
        const uid = getUid();
        if (!uid) return 0;

        const monthStr = month.toISOString().slice(0, 7); // YYYY-MM

        // 1. Try to find specific monthly assignment in Firestore
        // Path: users/{uid}/monthly_budgets where month == monthStr AND scope == scope AND category == categoryName
        // Note: Firestore doesn't support array-contains for object equality easily like Dexie. 
        // We query by individual fields.

        const qMonthly = query(
            collection(db, 'users', uid, 'monthly_budgets'),
            where('month', '==', monthStr),
            where('scope', '==', scope),
            where('category', '==', categoryName)
        );

        const snapshotMonthly = await getDocs(qMonthly);
        if (!snapshotMonthly.empty) {
            const monthlyData = snapshotMonthly.docs[0].data() as MonthlyBudget;
            return monthlyData.assigned;
        }

        // 2. Fallback to default global category definition in Firestore
        // Path: users/{uid}/categories where scope == scope (or undefined if legacy?) AND name == categoryName
        // Assuming categories are flattened. 

        // Note: We might want to fetch all categories and filter in memory if we do this often, 
        // but for single category check, a specific query is fine.
        const qCategory = query(
            collection(db, 'users', uid, 'categories'),
            where('name', '==', categoryName)
        );

        const snapshotCategory = await getDocs(qCategory);

        if (!snapshotCategory.empty) {
            // Find the one matching scope (handling 'PERSONAL' as default if scope is missing/undefined in legacy data)
            const cat = snapshotCategory.docs.map(d => d.data() as CategoryDef)
                .find(c => c.scope === scope || (!c.scope && scope === 'PERSONAL'));

            return cat?.budgetLimit || 0;
        }

        return 0;
    },

    // Set specific budget for a month
    async setBudgetForCategory(month: Date, categoryName: string, scope: Scope, amount: number): Promise<void> {
        const uid = getUid();
        if (!uid) return;

        const monthStr = month.toISOString().slice(0, 7);

        const q = query(
            collection(db, 'users', uid, 'monthly_budgets'),
            where('month', '==', monthStr),
            where('scope', '==', scope),
            where('category', '==', categoryName)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            const docRef = doc(db, 'users', uid, 'monthly_budgets', docId);
            await updateDoc(docRef, { assigned: amount });
        } else {
            const newItem: MonthlyBudget = {
                id: generateId(),
                month: monthStr,
                category: categoryName,
                scope,
                assigned: amount,
                spent: 0
            };
            // Use custom ID if possible or auto-gen. Let's use custom ID for doc ID to match newItem.id
            const docRef = doc(db, 'users', uid, 'monthly_budgets', newItem.id);
            await setDoc(docRef, newItem);
        }
    },

    // Whack-A-Mole: Move funds from one category to another
    async moveFunds(fromCategory: string, toCategory: string, amount: number, month: Date, scope: Scope): Promise<void> {
        const fromBudget = await this.getBudgetForCategory(month, fromCategory, scope);
        const toBudget = await this.getBudgetForCategory(month, toCategory, scope);

        await this.setBudgetForCategory(month, fromCategory, scope, fromBudget - amount);
        await this.setBudgetForCategory(month, toCategory, scope, toBudget + amount);
    },

    // Analyze Budget Health to find Negative Categories
    async getBudgetHealth(month: Date, scope: Scope) {
        const uid = getUid();
        if (!uid) return { details: [], hasOverspent: false, overspentCategories: [], healthyCategories: [] };

        const monthStr = month.toISOString().slice(0, 7);
        const startStr = `${monthStr}-01`;

        // Calculate end of month correctly
        const year = parseInt(monthStr.split('-')[0]);
        const m = parseInt(monthStr.split('-')[1]);
        const lastDay = new Date(year, m, 0).getDate();
        const endStr = `${monthStr}-${lastDay}`;


        // 1. Get all transactions for the month from Firestore
        const qTxs = query(
            collection(db, 'users', uid, 'transactions'),
            where('scope', '==', scope),
            where('date', '>=', startStr),
            where('date', '<=', endStr),
            where('type', '==', 'EXPENSE')
        );

        const txSnapshot = await getDocs(qTxs);
        const txs = txSnapshot.docs.map(d => d.data() as Transaction);

        // 2. Aggregate spending by category
        const spending: Record<string, number> = {};
        const categoriesInvolved = new Set<string>();

        txs.forEach(t => {
            spending[t.category] = (spending[t.category] || 0) + t.amount;
            categoriesInvolved.add(t.category);
        });

        // 3. Get all defined categories from Firestore
        // We fetch all and filter by scope in memory to minimize queries if we just have one index
        // Or specific query:
        const qCats = query(
            collection(db, 'users', uid, 'categories'),
            where('scope', '==', scope) // Assuming simple scope match
        );
        // Note: For now, we query exact scope. If we need to support 'PERSONAL' fallback for legacy, we might need logic.
        // Let's assume standardized data for now or fetch all.
        // To be safe and mimic original logic:
        const allCatsSnapshot = await getDocs(collection(db, 'users', uid, 'categories'));
        const allCats = allCatsSnapshot.docs
            .map(d => d.data() as CategoryDef)
            .filter(c => c.scope === scope || (!c.scope && scope === 'PERSONAL'));

        allCats.forEach(c => categoriesInvolved.add(c.name));

        const health = [];

        // Optimisation: Fetch all monthly budgets for this month/scope once
        const qBudgets = query(
            collection(db, 'users', uid, 'monthly_budgets'),
            where('month', '==', monthStr),
            where('scope', '==', scope)
        );
        const budgetSnapshot = await getDocs(qBudgets);
        const monthlyBudgetsMap = new Map<string, number>();
        budgetSnapshot.docs.forEach(d => {
            const data = d.data() as MonthlyBudget;
            monthlyBudgetsMap.set(data.category, data.assigned);
        });


        for (const cat of Array.from(categoriesInvolved)) {
            // Priority: Monthly > Default
            let assigned = monthlyBudgetsMap.get(cat);

            if (assigned === undefined) {
                const defaultCat = allCats.find(c => c.name === cat);
                assigned = defaultCat?.budgetLimit || 0;
            }

            const spent = spending[cat] || 0;
            // CORRECT LOGIC: 
            // Spending is negative (e.g. -5000). Budget is positive (e.g. 150).
            // Available = Budget + Spending (150 + (-5000) = -4850)
            const available = assigned + spent;

            health.push({
                category: cat,
                assigned,
                spent,
                available,
                status: available < 0 ? 'OVERSPENT' : (available === 0 ? 'ZERO' : 'HEALTHY')
            });
        }

        return {
            details: health,
            hasOverspent: health.some(h => h.status === 'OVERSPENT'),
            overspentCategories: health.filter(h => h.status === 'OVERSPENT'),
            healthyCategories: health.filter(h => h.status === 'HEALTHY' && h.available > 0)
        };
    }
};
