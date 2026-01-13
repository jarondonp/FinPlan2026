import { IncomeSource, RecurringExpense, CategoryDef, Account, Scope } from "../types";

export interface DailyBalance {
    date: Date;
    dateStr: string; // YYYY-MM-DD
    startBalance: number;
    endBalance: number;
    incomes: { name: string; amount: number }[];
    expenses: { name: string; amount: number; type: 'fixed' | 'variable' | 'debt' }[];
    lowestBalance: number; // For the day
}

export const calculateDailyBalances = (
    initialBalance: number,
    daysToProject: number,
    incomes: IncomeSource[],
    expenses: RecurringExpense[],
    categories: CategoryDef[],
    accounts: Account[],
    scope: Scope
): DailyBalance[] => {
    const result: DailyBalance[] = [];
    let currentBalance = initialBalance;
    const today = new Date();

    // 1. Calculate Daily Burn Rate per Category
    // Burn Rate = (Budget Limit - Sum of Recurrents in that Category) / 30
    // prevent negative burn rate if Recurrents > Budget
    const dailyBurnRate = categories
        .filter(cat => !cat.isHidden) // FIX: Ignore hidden categories
        .reduce((total, cat) => {
            const catLimit = cat.budgetLimit || 0;
            const catFixed = expenses
                .filter(e => e.category === cat.name && e.active && (e.frequency === 'MONTHLY' || !e.frequency))
                .reduce((sum, e) => sum + e.amount, 0);

            const variablePart = Math.max(0, catLimit - catFixed);
            return total + (variablePart / 30);
        }, 0);

    // If BUSINESS, ignore estimated daily burn (focus on known bills/invoices)
    const effectiveBurnRate = scope === 'BUSINESS' ? 0 : dailyBurnRate;

    for (let i = 0; i < daysToProject; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);
        const dateStr = currentDate.toISOString().slice(0, 10);
        const dayOfMonth = currentDate.getDate();

        // Check Incomes
        const dayIncomes = incomes.filter(inc => {
            if (inc.frequency === 'MONTHLY') return inc.payDay1 === dayOfMonth;
            if (inc.frequency === 'BIWEEKLY') return inc.payDay1 === dayOfMonth || inc.payDay2 === dayOfMonth;
            return false;
        }).map(inc => ({ name: inc.name, amount: inc.amount }));

        // Check Fixed Expenses
        const dayFixedExpenses = expenses.filter(exp => {
            if (!exp.active) return false;

            // Handle Monthly Frequencies
            if (exp.frequency === 'MONTHLY') {
                // Determine the day to trigger
                // Prefer nextDueDate day, fallback to dueDay
                const dueDay = exp.nextDueDate ? new Date(exp.nextDueDate).getDate() : exp.dueDay;
                return dueDay === dayOfMonth;
            }

            // Handle Non-Monthly (Annual, Quarterly, etc.)
            // Only show if the projection date MATCHES the nextDueDate
            return exp.nextDueDate === dateStr;
        }).map(exp => ({ name: exp.name, amount: exp.amount, type: 'fixed' as const }));

        // Check Credit Card Minimum Payments
        const dayDebtPayments = accounts.filter(acc => {
            return (acc.type === 'Credit Card' || acc.type === 'Loan') &&
                acc.minPayment && acc.minPayment > 0 &&
                acc.dueDay === dayOfMonth;
        }).map(acc => ({ name: `Pago Mínimo ${acc.name}`, amount: acc.minPayment || 0, type: 'debt' as const }));

        // Burn Rate Expense
        const safeBurnRate = effectiveBurnRate > 0 ? [{ name: "Gastos Variables Est.", amount: effectiveBurnRate, type: 'variable' as const }] : [];

        // Totals
        const totalIncome = dayIncomes.reduce((sum, item) => sum + item.amount, 0);
        const totalFixed = dayFixedExpenses.reduce((sum, item) => sum + item.amount, 0);
        const totalDebt = dayDebtPayments.reduce((sum, item) => sum + item.amount, 0);
        const totalBurn = effectiveBurnRate;

        const startBalance = currentBalance;
        currentBalance = currentBalance + totalIncome - (totalFixed + totalDebt + totalBurn);

        result.push({
            date: currentDate,
            dateStr,
            startBalance,
            endBalance: currentBalance,
            incomes: dayIncomes,
            expenses: [...dayFixedExpenses, ...dayDebtPayments, ...safeBurnRate],
            lowestBalance: Math.min(startBalance, currentBalance)
        });
    }

    return result;
};
