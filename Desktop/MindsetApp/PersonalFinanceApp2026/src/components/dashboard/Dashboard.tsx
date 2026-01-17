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
        // Use the CENTRALIZED smart calculation
        const result = calculateSmartReserve(recurringExpenses);

        // Map 'critical' (Overdue + Urgent)
        const critical = [...result.vencidos, ...result.urgentes].map(exp => ({
            exp,
            days: daysBetween(new Date().toISOString().split('T')[0], exp.nextDueDate)
        }));

        // Map 'upcomingNonMonthly' (Active + Pending)
        const activeReserves = result.proximos.map(exp => {
            const days = daysBetween(new Date().toISOString().split('T')[0], exp.nextDueDate);
            const monthsDisp = Math.max(1, Math.floor(days / 30));
            // Recalculate quota locally or rely on helper
            const target = exp.reservation?.targetAmount || exp.amount;
            const saved = exp.reservation?.initialSaved || 0;
            const reserve = (target - saved) / monthsDisp;

            return { exp, days, reserve, status: 'ACTIVE' };
        });

        const pendingReserves = result.pendientes.map(item => {
            const days = daysBetween(new Date().toISOString().split('T')[0], item.exp.nextDueDate);
            return {
                exp: item.exp,
                days,
                reserve: 0,
                status: 'PENDING',
                startDate: item.startDate
            };
        });

        // Combine and sort by due date
        const allUpcoming = [...activeReserves, ...pendingReserves].sort((a, b) => {
            return new Date(a.exp.nextDueDate).getTime() - new Date(b.exp.nextDueDate).getTime();
        });

        return { critical, upcomingNonMonthly: allUpcoming };
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

            {/* Personal Cards (Reorganized) */}
            {scope === 'PERSONAL' && (
                <div className="space-y-8">
                    {/* Row 1: KPIs (4 Columns) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {/* 1. Saldo en Cheques */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <DollarSign size={24} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo en Cuentas</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalLiquidity)}</div>
                            <div className="text-xs text-slate-500 mt-2">Efectivo disponible</div>
                        </div>

                        {/* 2. Ingresos (Mes) - Moved Up */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                                    <ArrowUpRight size={24} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresos (Mes)</span>
                            </div>
                            <div className="text-3xl font-bold text-emerald-600">{formatCurrency(monthlyStats.income)}</div>
                        </div>

                        {/* 3. Gastos (Mes) - Moved Here */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                    <ArrowDownRight size={24} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gastos (Mes)</span>
                            </div>
                            <div className="text-3xl font-bold text-rose-600">{formatCurrency(monthlyStats.expense)}</div>
                        </div>

                        {/* 4. Deuda Total + Crédito Disponible (Merged) */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                    <CreditCard size={24} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deuda Total</span>
                            </div>

                            <div className="text-3xl font-bold text-rose-600 mb-1">{formatCurrency(totalDebt)}</div>

                            {/* Available Credit Context */}
                            {(() => {
                                const creditData = activeAccounts
                                    .filter(a => a.type === 'Credit Card')
                                    .reduce((acc, a) => {
                                        const debt = Math.abs(a.dynamicBalance || 0);
                                        const limit = a.limit || 0;
                                        return { debt: acc.debt + debt, limit: acc.limit + limit };
                                    }, { debt: 0, limit: 0 });

                                const available = Math.max(0, creditData.limit - creditData.debt);
                                const usagePercent = creditData.limit > 0 ? (creditData.debt / creditData.limit) * 100 : 0;

                                return (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>Disponible: <span className="text-emerald-600">{formatCurrency(available)}</span></span>
                                            <span>{usagePercent.toFixed(0)}% Uso</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${usagePercent > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${Math.min(100, usagePercent)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Row 2: Charts & Planning (2 Columns) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

                        {/* Upcoming Expenses (Planning) */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                        <Briefcase size={20} />
                                    </div>
                                    <span className="font-bold text-slate-800">Próximos Gastos Anuales</span>
                                </div>
                                <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-full text-slate-500 font-bold border border-slate-200">
                                    Reserva Sugerida
                                </span>
                            </div>

                            {subscriptionAlerts.upcomingNonMonthly.length > 0 ? (
                                <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
                                    {subscriptionAlerts.upcomingNonMonthly.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                    {item.exp.name}
                                                    {item.status === 'PENDING' && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold border border-slate-200">
                                                            Pausado
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                    <span>{getFrequencyLabel(item.exp.frequency)}</span>
                                                    <span className={`${item.days <= 60 ? 'text-amber-600 font-medium' : ''}`}>
                                                        Vence en {item.days} días
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                {item.status === 'ACTIVE' ? (
                                                    // Active Reserve Display
                                                    <>
                                                        <div className="font-mono font-bold text-indigo-600">{formatCurrency(item.reserve)}/mes</div>
                                                        <div className="text-[10px] text-slate-400">Total: {formatCurrency(item.exp.amount)}</div>
                                                    </>
                                                ) : (
                                                    // Pending Reserve Display (Show Start Date)
                                                    <>
                                                        <div className="flex flex-col items-end">
                                                            <div className="text-[10px] font-bold text-slate-500 mb-0.5">Inicia en</div>
                                                            <div className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                                                                {item.startDate ? new Date(item.startDate).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase() : 'N/A'}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-4 text-center">
                                    No hay gastos anuales próximos para planificar.
                                </div>
                            )}

                            <button
                                onClick={() => onNavigate('settings:recurring')}
                                className="w-full mt-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-dashed border-indigo-200"
                            >
                                Administrar Suscripciones
                            </button>
                        </div>
                    </div>

                    {/* Row 3: Recent Transactions (Full Width) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800">Transacciones Recientes</h3>
                            <button onClick={() => onNavigate('import')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700">Ver todas</button>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {transactions
                                .filter(t => selectedAccountIds.length === 0 || selectedAccountIds.includes(t.account_id))
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .slice(0, 5)
                                .map(t => (
                                    <div key={t.id} className="py-4 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg transition-colors -mx-2">
                                        <div className="flex items-center gap-4">
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
                            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <p>No hay transacciones recientes.</p>
                                <button onClick={() => onNavigate('import')} className="mt-2 text-sm text-indigo-600 font-bold hover:underline">Importar Extracto</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

