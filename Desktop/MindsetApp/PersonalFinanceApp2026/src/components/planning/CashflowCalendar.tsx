import React, { useMemo, useState } from 'react';
import { calculateDailyBalances, DailyBalance } from '../../utils/cashflowLogic';
import { formatCurrency } from '../../utils';
import { ChevronLeft, ChevronRight, AlertCircle, TrendingUp, Calendar as CalIcon, Flame, CreditCard } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';
import { useAccountBalance } from '../../hooks/useAccountBalance';
import { useFirestore } from '../../hooks/useFirestore';
import { IncomeSource, RecurringExpense, CategoryDef } from '../../types';

export const CashflowCalendar = () => {
    const { scope } = useScope();
    // Use useAccountBalance hook to get accounts with dynamicBalance
    const accounts = useAccountBalance(scope);

    // Cloud Data
    const { data: allIncomes } = useFirestore<IncomeSource>('incomeSources');
    const incomes = (allIncomes || []).filter(i => i.scope === scope || (scope === 'PERSONAL' && !i.scope));

    const { data: allExpenses } = useFirestore<RecurringExpense>('recurringExpenses');
    const expenses = (allExpenses || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

    const { data: allCategories } = useFirestore<CategoryDef>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    // Calculate Initial Liquid Balance (Checking + Savings usually, but let's stick to Checking for 'Spendable')
    const initialBalance = useMemo(() => {
        return accounts
            .filter(a => a.type === 'Checking')
            // Use dynamicBalance (current balance) not static balance (historical anchor)
            // dynamicBalance = initial balance + all transactions
            .reduce((sum, a) => sum + (a.dynamicBalance || 0), 0);
    }, [accounts]);

    const projectionDays = 60;
    const dailyBalances = useMemo(() => {
        return calculateDailyBalances(initialBalance, projectionDays, incomes, expenses, categories, accounts, scope);
    }, [initialBalance, incomes, expenses, categories, accounts, scope]);

    // Calendar View Logic
    const [viewDate, setViewDate] = useState(new Date());

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
        return { days, firstDay };
    };

    const { days, firstDay } = getDaysInMonth(viewDate);
    const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    // Calculate Consistency Health
    const healthStatus = useMemo(() => {
        let budgetTotal = 0;
        let recurringTotal = 0;
        categories.forEach(c => budgetTotal += c.budgetLimit || 0);
        expenses.forEach(e => { if (e.active) recurringTotal += e.amount; });

        return {
            isValid: budgetTotal >= recurringTotal,
            diff: recurringTotal - budgetTotal
        };
    }, [categories, expenses]);


    const renderCalendarGrid = () => {
        const grid = [];
        // Empty cells for padding
        for (let i = 0; i < firstDay; i++) {
            grid.push(<div key={`empty-${i}`} className="bg-slate-50 border-b border-r border-slate-100 min-h-[100px]"></div>);
        }

        // Days
        for (let day = 1; day <= days; day++) {
            const currentDayDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
            const dateStr = currentDayDate.toISOString().slice(0, 10);
            const balanceData = dailyBalances.find(d => d.dateStr === dateStr);
            const isToday = new Date().toDateString() === currentDayDate.toDateString();

            const hasWarning = balanceData && balanceData.endBalance < 0;
            const flowClass = hasWarning ? 'bg-rose-50' : (isToday ? 'bg-indigo-50 ring-2 ring-indigo-500 ring-inset' : 'bg-white');

            grid.push(
                <div key={day} className={`p-2 border-b border-r border-slate-200 min-h-[100px] flex flex-col justify-between relative group hover:bg-slate-50 transition-colors ${flowClass}`}>
                    <div className="flex justify-between items-start">
                        <span className={`text-xs font-bold ${isToday ? 'text-indigo-600 bg-indigo-100 px-1.5 rounded' : 'text-slate-400'}`}>{day}</span>
                        {balanceData && (
                            <span className={`text-[10px] font-mono font-bold ${balanceData.endBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {formatCurrency(balanceData.endBalance)}
                            </span>
                        )}
                    </div>

                    <div className="space-y-1 mt-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                        {balanceData?.incomes.map((inc, idx) => (
                            <div key={`inc-${idx}`} className="bg-emerald-100 text-emerald-700 text-[10px] px-1 rounded truncate font-medium">
                                + {formatCurrency(inc.amount)} {inc.name}
                            </div>
                        ))}
                        {balanceData?.expenses.map((exp, idx) => {
                            let style = "bg-rose-100 text-rose-700";
                            let icon = null;
                            if (exp.type === 'variable') { style = "bg-amber-100 text-amber-700"; icon = <Flame size={8} className="inline mr-0.5" />; }
                            if (exp.type === 'debt') { style = "bg-violet-100 text-violet-700"; icon = <CreditCard size={8} className="inline mr-0.5" />; }

                            return (
                                <div key={`exp-${idx}`} className={`${style} text-[10px] px-1 rounded truncate font-medium flex items-center`}>
                                    {icon} - {formatCurrency(exp.amount)} {exp.name}
                                </div>
                            );
                        })}
                    </div>

                    {hasWarning && (
                        <div className="absolute bottom-1 right-1">
                            <AlertCircle size={14} className="text-rose-500" />
                        </div>
                    )}
                </div>
            );
        }
        return grid;
    };

    // Low Balance Alert (Next 30 days)
    const upcomingLowBalance = dailyBalances
        .filter(d => d.endBalance < 0)
        .slice(0, 3); // Top 3 risks

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500 flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <TrendingUp size={24} />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Proyección de Flujo</h1>
                    </div>
                    <p className="text-slate-500">Visualiza tu futuro financiero y anticipa faltas de liquidez.</p>
                </div>

                <div className="flex flex-col gap-2 items-end">
                    {/* Consistency Widget */}
                    {!healthStatus.isValid && (
                        <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse">
                            <AlertCircle className="text-amber-600" size={16} />
                            <div className="text-xs text-amber-800 font-medium">
                                Conflicto: Fijos exceden Presupuesto en <span className="font-bold">{formatCurrency(healthStatus.diff)}</span>
                            </div>
                        </div>
                    )}

                    {upcomingLowBalance.length > 0 && (
                        <div className="bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg flex items-center gap-2 max-w-sm">
                            <AlertCircle className="text-rose-600" size={16} />
                            <div className="text-xs text-rose-800 font-medium">
                                Alerta: Saldo negativo el <b>{new Date(upcomingLowBalance[0].date).toLocaleDateString()}</b>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                {/* Calendar Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><ChevronLeft size={20} /></button>
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-bold text-slate-700 capitalize flex items-center gap-2">
                            <CalIcon size={18} className="text-slate-400" /> {monthName}
                        </h2>
                        <div className="flex gap-2 text-[10px] font-medium text-slate-400">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400"></span>Fijo</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Variable (Burn)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400"></span>Deuda</span>
                        </div>
                    </div>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><ChevronRight size={20} /></button>
                </div>

                {/* Days Header */}
                <div className="grid grid-cols-7 text-center border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-400 py-2 flex-shrink-0">
                    <div>DOM</div><div>LUN</div><div>MAR</div><div>MIE</div><div>JUE</div><div>VIE</div><div>SAB</div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-7 flex-1 overflow-y-auto">
                    {renderCalendarGrid()}
                </div>
            </div>
        </div>
    );
};
