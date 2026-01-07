import { db } from '../db/db';
import { Scope, MonthlyBudget } from '../types';
import { generateId } from '../utils';

export const budgetService = {
    // Get effective assigned budget for a category in a specific month
    async getBudgetForCategory(month: Date, categoryName: string, scope: Scope): Promise<number> {
        const monthStr = month.toISOString().slice(0, 7); // YYYY-MM

        // 1. Try to find specific monthly assignment
        const monthly = await db.monthlyBudgets
            .where('[month+scope]').equals([monthStr, scope])
            .filter(mb => mb.category === categoryName)
            .first();

        if (monthly) return monthly.assigned;

        // 2. Fallback to default global category definition
        const def = await db.categories
            .where('scope').equals(scope) // Assuming categories are scoped? Or name+scope composite?
            .filter(c => c.name === categoryName)
            .first();

        // Note: Default categories might have scope logic, assuming strict scope filter
        return def?.budgetLimit || 0;
    },

    // Set specific budget for a month
    async setBudgetForCategory(month: Date, categoryName: string, scope: Scope, amount: number): Promise<void> {
        const monthStr = month.toISOString().slice(0, 7);

        const existing = await db.monthlyBudgets
            .where('[month+scope]').equals([monthStr, scope])
            .filter(mb => mb.category === categoryName)
            .first();

        if (existing) {
            await db.monthlyBudgets.update(existing.id, { assigned: amount });
        } else {
            const newItem: MonthlyBudget = {
                id: generateId(),
                month: monthStr,
                category: categoryName,
                scope,
                assigned: amount,
                spent: 0
            };
            await db.monthlyBudgets.add(newItem);
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
        const monthStr = month.toISOString().slice(0, 7);
        const startStr = `${monthStr}-01`;
        const endStr = `${monthStr}-31`;

        // 1. Get all transactions for the month
        const txs = await db.transactions
            .where('scope').equals(scope)
            .filter(t => t.date >= startStr && t.date <= endStr && t.type === 'EXPENSE')
            .toArray();

        // 2. Aggregate spending by category
        const spending: Record<string, number> = {};
        const categoriesInvolved = new Set<string>();

        txs.forEach(t => {
            spending[t.category] = (spending[t.category] || 0) + t.amount;
            categoriesInvolved.add(t.category);
        });

        // 3. Get all defined categories (to find those with 0 spending but budget assigned)
        const allCats = await db.categories.filter(c => !c.scope || c.scope === scope).toArray();
        allCats.forEach(c => categoriesInvolved.add(c.name));

        const health = [];

        for (const cat of Array.from(categoriesInvolved)) {
            const assigned = await this.getBudgetForCategory(month, cat, scope);
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
