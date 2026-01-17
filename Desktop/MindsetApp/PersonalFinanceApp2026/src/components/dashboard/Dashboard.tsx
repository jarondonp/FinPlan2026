import React, { useMemo, useState, useEffect } from 'react';
// import { useLiveQuery } from 'dexie-react-hooks'; // Removed for Firestore
// import { db } from '../../db/db'; // Removed for Firestore
import { db } from '../../firebase/config'; // Import Firebase Instance
import { doc, updateDoc } from 'firebase/firestore'; // Import write functions
import { useFirestore } from '../../hooks/useFirestore';
import { formatCurrency } from '../../utils';
import { useGlobalFilter, useScope } from '../../context/GlobalFilterContext';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, AlertTriangle, ChevronDown, ChevronUp, Briefcase, Activity, CreditCard, ChevronRight, Check } from 'lucide-react';
import { MonthStatusBadge } from '../closing/MonthStatusBadge';
import { AiInsightWidget } from './AiInsightWidget';
import { useAccountBalance } from '../../hooks/useAccountBalance';
import { calculateSmartReserve, daysBetween, getUrgencyBadge, getFrequencyLabel, calculateNextDueDate } from '../../utils/subscriptionHelpers';
import { RecurringExpense } from '../../types';

interface DashboardProps {
    onNavigate: (view: string) => void;
}

export const Dashboard = ({ onNavigate }: DashboardProps) => {
    const { scope } = useScope();
    const {
        filterState,
        setScope,
        setTimeframe,
        toggleAccount,
        setComparisonMode
    } = useGlobalFilter();
    const { timeframe, selectedAccountIds } = filterState;

    // Data Fetching (Cloud)
    // We fetch all and filter in memory for now (simpler migration)
    const { data: allTransactions } = useFirestore<any>('transactions');
    const transactions = (allTransactions || []).filter(t => t.scope === scope || (scope === 'PERSONAL' && !t.scope));

    // Accounts are fetched via the hook which we already updated
    const accounts = useAccountBalance(scope);

    const { data: allCategories } = useFirestore<any>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    const { data: allRecurring } = useFirestore<any>('recurringExpenses');
    const recurringExpenses = (allRecurring || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

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
            // Debt Convention: Always show debt as POSITIVE
            // Internal storage is negative, but display should be positive
            acc.totalDebt += Math.abs(a.dynamicBalance || 0);
        } else {
            acc.totalLiquidity += (a.dynamicBalance || 0);
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

    // --- Subscription Alerts Logic ---
    const subscriptionAlerts = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const critical: { exp: RecurringExpense, days: number }[] = [];
        const upcomingNonMonthly: { exp: RecurringExpense, days: number, reserve: number }[] = [];

        recurringExpenses.forEach(exp => {
            if (!exp.active) return;
            const days = daysBetween(today, exp.nextDueDate || '');

            // Critical Alerts (Overdue or Urgent < 30 days) of ANY frequency
            if (days < 30) {
                critical.push({ exp, days });
            }

            // Upcoming Annual/Non-Monthly (Show if > 0 days and it is not monthly)
            // We want to highlight these for planning reserves
            if (exp.frequency !== 'MONTHLY' && days >= 0) {
                const monthsDisp = Math.max(1, Math.floor(days / 30));
                const reserve = exp.amount / monthsDisp;
                upcomingNonMonthly.push({ exp, days, reserve });
            }
        });

        return { critical, upcomingNonMonthly };
    }, [recurringExpenses]);

    // --- Mark as Paid Logic ---
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isAlertsExpanded, setIsAlertsExpanded] = useState(false);

    const handleMarkAsPaid = async (e: React.MouseEvent, expense: RecurringExpense) => {
        e.stopPropagation();
        if (!expense.nextDueDate) return;

        setProcessingId(expense.id);
        try {
            // Calculate NEXT date
            const nextDate = calculateNextDueDate(expense.nextDueDate, expense.frequency);

            // Allow time for animation feel
            await new Promise(r => setTimeout(r, 500));

            // Update in Firestore
            const ref = doc(db, 'recurringExpenses', expense.id);
            await updateDoc(ref, {
                nextDueDate: nextDate
            });

            // No need to create transaction as per user request (cleaner flow)
        } catch (error) {
            console.error("Error updating expense", error);
            alert("Error al actualizar la fecha.");
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className={`p-8 max-w-7xl mx-auto animate-in fade-in duration-500 ${scope === 'BUSINESS' ? 'bg-slate-50/50 min-h-screen' : ''}`}>
            <h1 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                Dashboard
                {scope === 'BUSINESS' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full uppercase tracking-wider border border-blue-200">Empresa</span>}
                <MonthStatusBadge />
            </h1>

            {/* ACTIONABLE ALERT CENTER (New Design) */}
            {subscriptionAlerts.critical.length > 0 && (
                <div className="mb-8 animate-in slide-in-from-top-2">
                    {/* Header Bar (Accordion Trigger) */}
                    <div
                        onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                        className={`
                            cursor-pointer rounded-xl border shadow-sm transition-all duration-300 overflow-hidden
                            ${isAlertsExpanded ? 'bg-white ring-2 ring-rose-100 border-rose-200' : 'bg-rose-50 border-rose-200 hover:bg-rose-100'}
                        `}
                    >
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${isAlertsExpanded ? 'bg-rose-100 text-rose-600' : 'bg-rose-200 text-rose-700'}`}>
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-rose-800 text-base">
                                        Tienes {subscriptionAlerts.critical.length} pagos prioritarios
                                    </h3>
                                    <p className="text-xs text-rose-600 font-medium">
                                        {isAlertsExpanded ? 'Revisa y gestiona cada pago individualmente:' : 'Haz clic para ver la lista y marcar como pagados.'}
                                    </p>
                                </div>
                            </div>
                            <div className={`text-rose-400 transition-transform duration-300 ${isAlertsExpanded ? 'rotate-180' : ''}`}>
                                <ChevronDown size={20} />
                            </div>
                        </div>

                        {/* Collapsible Content */}
                        <div className={`
                            transition-[max-height,opacity] duration-300 ease-in-out
                            ${isAlertsExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                        `}>
                            <div className="border-t border-rose-100 bg-white">
                                <div className="divide-y divide-slate-100">
                                    {subscriptionAlerts.critical.map((item) => (
                                        <div key={item.exp.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg shadow-sm border border-slate-200">
                                                    {item.exp.icon || '📄'}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800">{item.exp.name}</div>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="font-mono font-medium text-slate-600">{formatCurrency(item.exp.amount)}</span>
                                                        <span className="text-slate-300">•</span>
                                                        <span className={`${item.days < 0 ? 'text-rose-600 font-bold' : 'text-amber-600 font-medium'}`}>
                                                            {item.days < 0 ? `Venció hace ${Math.abs(item.days)} días` : `Vence en ${item.days} días`}
                                                        </span>
                                                        <span className="text-slate-400">({item.exp.nextDueDate})</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={(e) => handleMarkAsPaid(e, item.exp)}
                                                disabled={processingId === item.exp.id}
                                                className={`
                                                    px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all
                                                    ${processingId === item.exp.id
                                                        ? 'bg-emerald-100 text-emerald-700 cursor-wait'
                                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 shadow-sm'}
                                                `}
                                            >
                                                {processingId === item.exp.id ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-emerald-600 border-t-transparent"></div>
                                                        Actualizando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check size={14} className="group-hover:scale-110 transition-transform" />
                                                        Marcar Pagado
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-2 bg-slate-50 text-center text-[10px] text-slate-400 border-t border-slate-100">
                                    Nota: "Marcar Pagado" solo actualiza la fecha de vencimiento. No afecta tu saldo.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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



            {/* AI Insight Widget - Shows for both scopes */}
            <AiInsightWidget onNavigate={onNavigate} />

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
                    {/* Saldo en Cheques - Only Checking/Savings */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                <DollarSign size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo en Cheques</span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalLiquidity)}</div>
                        <div className="text-xs text-slate-500 mt-2">Efectivo disponible</div>
                    </div>

                    {/* Crédito Disponible TDC - Available credit from credit cards */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <CreditCard size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Crédito Disponible</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-600">
                            {formatCurrency(activeAccounts
                                .filter(a => a.type === 'Credit Card')
                                .reduce((sum, a) => {
                                    const debt = Math.abs(a.dynamicBalance || 0);
                                    const limit = a.limit || 0;
                                    return sum + Math.max(0, limit - debt);
                                }, 0)
                            )}
                        </div>
                        <div className="text-xs text-slate-500 mt-2">Límite - Deuda</div>
                    </div>

                    {/* Deuda Total - Unchanged */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                <CreditCard size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deuda Total</span>
                        </div>
                        <div className="text-3xl font-bold text-rose-600">{formatCurrency(totalDebt)}</div>
                        <div className="text-xs text-slate-500 mt-2">Tarjetas + Préstamos</div>
                    </div>

                    {/* Monthly Stats - Moved to 2nd row or keep as 4th item */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                                <ArrowUpRight size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresos (Mes)</span>
                        </div>
                        <div className="text-3xl font-bold text-emerald-600">{formatCurrency(monthlyStats.income)}</div>
                    </div>
                </div>
            )}

            {/* Second row for Gastos if needed, or merge into single row */}
            {scope === 'PERSONAL' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                <ArrowDownRight size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gastos (Mes)</span>
                        </div>
                        <div className="text-3xl font-bold text-rose-600">{formatCurrency(monthlyStats.expense)}</div>
                    </div>

                    {/* NEW: Upcoming Annual Expenses Widget */}
                    {subscriptionAlerts.upcomingNonMonthly.length > 0 && (
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-2">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                        <Briefcase size={20} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Próximos Gastos Anuales</span>
                                </div>
                                <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-full text-slate-500 font-bold border border-slate-200">
                                    Reserva Sugerida
                                </span>
                            </div>

                            <div className="space-y-3">
                                {subscriptionAlerts.upcomingNonMonthly.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{item.exp.name}</div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span>{getFrequencyLabel(item.exp.frequency)}</span>
                                                <span className={`${item.days <= 60 ? 'text-amber-600 font-medium' : ''}`}>
                                                    Vence en {item.days} días
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-indigo-600">{formatCurrency(item.reserve)}/mes</div>
                                            <div className="text-[10px] text-slate-400">Total: {formatCurrency(item.exp.amount)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {subscriptionAlerts.upcomingNonMonthly.length > 3 && (
                                <button
                                    onClick={() => onNavigate('settings:recurring')}
                                    className="w-full mt-3 text-xs text-center text-slate-500 hover:text-indigo-600 py-1"
                                >
                                    Ver {subscriptionAlerts.upcomingNonMonthly.length - 3} más...
                                </button>
                            )}
                        </div>
                    )}
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
