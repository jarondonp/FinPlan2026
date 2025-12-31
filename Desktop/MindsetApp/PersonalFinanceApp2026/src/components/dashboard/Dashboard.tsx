import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { formatCurrency } from '../../utils';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, AlertTriangle, ChevronDown, ChevronUp, Briefcase, Activity, CreditCard } from 'lucide-react';
import { MonthStatusBadge } from '../closing/MonthStatusBadge';

interface DashboardProps {
    onNavigate: (view: string) => void;
}

export const Dashboard = ({ onNavigate }: DashboardProps) => {
    const { filterState } = useGlobalFilter();
    const { scope, timeframe, selectedAccountIds } = filterState;

    // Data Fetching
    const transactions = useLiveQuery(() => db.transactions
        .filter(t => t.scope === scope || (scope === 'PERSONAL' && !t.scope))
        .toArray(), [scope]) || [];

    const accounts = useLiveQuery(() => db.accounts
        .filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope))
        .toArray(), [scope]) || [];

    const categories = useLiveQuery(() => db.categories
        .filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope))
        .toArray(), [scope]) || [];

    const recurringExpenses = useLiveQuery(() => db.recurringExpenses
        .filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope))
        .toArray(), [scope]) || [];

    // State for alert details
    const [expandedAlerts, setExpandedAlerts] = useState<Record<number, boolean>>({});

    const toggleAlert = (idx: number) => {
        setExpandedAlerts(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    // Filter Helper
    const isTransactionInTimeframe = (dateStr: string) => {
        // Fix: Parse manually to avoid UTC offset issues
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d); // Local time 00:00:00
        return date >= timeframe.start && date <= timeframe.end;
    };

    // Financial Overview
    // Filter accounts if specific accounts are selected
    const activeAccounts = selectedAccountIds.length > 0
        ? accounts.filter(a => selectedAccountIds.includes(a.id))
        : accounts;

    const { totalLiquidity, totalDebt } = activeAccounts.reduce((acc, a) => {
        const isLiability = a.type === 'Credit Card' || a.type === 'Loan';
        if (isLiability) {
            acc.totalDebt += (a.balance || 0);
        } else {
            acc.totalLiquidity += (a.balance || 0);
        }
        return acc;
    }, { totalLiquidity: 0, totalDebt: 0 });

    const monthlyStats = useMemo(() => {
        return transactions.reduce((stats, t) => {
            // Check Timeframe
            if (!isTransactionInTimeframe(t.date)) return stats;

            // Check Account Filter
            if (selectedAccountIds.length > 0 && !selectedAccountIds.includes(t.account_id)) return stats;

            if (t.type === 'INCOME') stats.income += t.amount;
            if (t.type === 'EXPENSE') stats.expense += Math.abs(t.amount);

            return stats;
        }, { income: 0, expense: 0 });
    }, [transactions, timeframe, selectedAccountIds]);

    // Financial Health / Consistency Check
    const consistencyIssues = useMemo(() => {
        let issues = [];
        // 1. Check if Budget < Recurring Expenses
        categories.forEach(cat => {
            const catRecurringTotal = recurringExpenses
                .filter(r => r.category === cat.name && r.active)
                .reduce((sum, r) => sum + r.amount, 0);

            if (catRecurringTotal > 0 && (!cat.budgetLimit || cat.budgetLimit < catRecurringTotal)) {
                issues.push({
                    type: 'BUDGET_CONFLICT',
                    title: `Conflicto en '${cat.name}'`,
                    message: `Tus gastos fijos (${formatCurrency(catRecurringTotal)}) son mayores que tu presupuesto asignado (${formatCurrency(cat.budgetLimit || 0)}).`,
                    details: `Esto causará que tu proyección de flujo de caja sea inexacta. Deberías aumentar el presupuesto de '${cat.name}' a por lo menos ${formatCurrency(catRecurringTotal)} para cubrir tus obligaciones fijas.`,
                    severity: 'high'
                });
            }
        });

        return issues;
    }, [categories, recurringExpenses]);

    // Spending by Category logic
    const spendingByCategory = useMemo(() => {
        const map: Record<string, number> = {};
        transactions
            .forEach(t => {
                if (t.type !== 'EXPENSE') return;
                if (!isTransactionInTimeframe(t.date)) return;
                if (selectedAccountIds.length > 0 && !selectedAccountIds.includes(t.account_id)) return;

                map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
            });

        return Object.entries(map)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); // Top 5
    }, [transactions, timeframe, selectedAccountIds]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className={`p-8 max-w-7xl mx-auto animate-in fade-in duration-500 ${scope === 'BUSINESS' ? 'bg-slate-50/50 min-h-screen' : ''}`}>
            <h1 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                Dashboard
                {scope === 'BUSINESS' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full uppercase tracking-wider border border-blue-200">Empresa</span>}
                <MonthStatusBadge />
            </h1>

            {/* Consistency Alert Area */}
            {consistencyIssues.length > 0 && (
                <div className="mb-8 grid gap-4">
                    {consistencyIssues.map((issue, idx) => (
                        <div key={idx} className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm animate-in slide-in-from-top-2 overflow-hidden transition-all">
                            <div className="p-4 flex items-start justify-between cursor-pointer hover:bg-amber-100/50 transition-colors" onClick={() => toggleAlert(idx)}>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg shrink-0">
                                        <AlertTriangle size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-amber-800 text-sm flex items-center gap-2">
                                            {issue.title}
                                            {expandedAlerts[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </h4>
                                        <p className="text-xs text-amber-700 mt-0.5">{issue.message}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onNavigate('budget');
                                    }}
                                    className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors border border-amber-200 shadow-sm"
                                >
                                    Corregir Ahora
                                </button>
                            </div>

                            {/* Expandable Details */}
                            {expandedAlerts[idx] && (
                                <div className="px-14 pb-4 pr-4 animate-in slide-in-from-top-1 fade-in duration-200">
                                    <p className="text-xs text-amber-800 leading-relaxed bg-amber-100/50 p-3 rounded-lg border border-amber-200/50">
                                        <span className="font-bold block mb-1">Detalle del problema:</span>
                                        {issue.details}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}



            {/* Business KPI Header */}
            {scope === 'BUSINESS' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <DollarSign size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Liquidez (Cash)</span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalLiquidity)}</div>
                        <div className="text-xs text-slate-500 mt-1">Deuda: <span className="text-rose-600 font-bold">{formatCurrency(totalDebt)}</span></div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                                <TrendingUp size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Revenue</span>
                        </div>
                        <div className="text-3xl font-bold text-emerald-600">{formatCurrency(monthlyStats.income)}</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                <Activity size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Burn Rate</span>
                        </div>
                        <div className="text-3xl font-bold text-rose-600">{formatCurrency(monthlyStats.expense)}</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                <Briefcase size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Runway Est.</span>
                        </div>
                        <div className="text-3xl font-bold text-indigo-600">
                            {monthlyStats.expense > 0 ? (totalLiquidity / monthlyStats.expense).toFixed(1) : "∞"} <span className="text-sm text-slate-400 font-medium">Meses</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Personal Cards (Hidden if Business) */}
            {scope === 'PERSONAL' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                <DollarSign size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Liquidez</span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalLiquidity)}</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                <CreditCard size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deuda Total</span>
                        </div>
                        <div className="text-3xl font-bold text-rose-600">{formatCurrency(totalDebt)}</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                                <ArrowUpRight size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresos (Mes)</span>
                        </div>
                        <div className="text-3xl font-bold text-emerald-600">{formatCurrency(monthlyStats.income)}</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                <ArrowDownRight size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gastos (Mes)</span>
                        </div>
                        <div className="text-3xl font-bold text-rose-600">{formatCurrency(monthlyStats.expense)}</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Spending Chart */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px]">
                    <h3 className="font-bold text-slate-800 mb-6">Gastos por Categoría</h3>
                    {spendingByCategory.length > 0 ? (
                        <ResponsiveContainer width="100%" height="90%">
                            <PieChart>
                                <Pie
                                    data={spendingByCategory}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {spendingByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            No hay gastos registrados este mes.
                        </div>
                    )}
                </div>

                {/* Recent Transactions */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <h3 className="font-bold text-slate-800 mb-6">Transacciones Recientes</h3>
                    <div className="divide-y divide-slate-100">
                        {transactions
                            .filter(t => selectedAccountIds.length === 0 || selectedAccountIds.includes(t.account_id))
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .slice(0, 5)
                            .map(t => (
                                <div key={t.id} className="py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${t.amount > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                            {t.amount > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{t.description_normalized || t.description_original}</div>
                                            <div className="text-xs text-slate-500">{new Date(t.date).toLocaleDateString()} • {t.category}</div>
                                        </div>
                                    </div>
                                    <div className={`font-mono font-bold text-sm ${t.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                        {formatCurrency(t.amount)}
                                    </div>
                                </div>
                            ))}
                    </div>
                    {transactions.length === 0 && (
                        <div className="text-center py-8 text-slate-400">No hay transacciones recientes.</div>
                    )}
                </div>
            </div>
        </div>
    );
};
