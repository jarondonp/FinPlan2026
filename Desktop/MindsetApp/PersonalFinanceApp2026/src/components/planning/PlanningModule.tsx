import React, { useState, useMemo } from 'react';
import { ShieldCheck, TrendingDown, Zap, Calendar, TrendingUp, CheckCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { formatCurrency } from '../../utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PlanningModuleProps {
    onNavigate: (view: string) => void;
}

export const PlanningModule = ({ onNavigate }: PlanningModuleProps) => {
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
    const [extraPayment, setExtraPayment] = useState(200);
    const [strategy, setStrategy] = useState<"AVALANCHE" | "SNOWBALL">("AVALANCHE");

    // Filter debt accounts
    const debtAccounts = useMemo(() => {
        return accounts
            .filter(a => (a.type === 'Credit Card' || a.type === 'Loan') && a.balance < 0)
            .map(a => ({
                ...a,
                balance: Math.abs(a.balance), // Work with positive numbers for calculation
                apr: a.apr || 0,
                minPayment: a.minPayment || Math.abs(a.balance) * 0.02 // Estimate 2% if missing
            }));
    }, [accounts]);

    // Debt Calculations
    const totalDebt = debtAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalMinPayment = debtAccounts.reduce((sum, a) => sum + a.minPayment, 0);
    const avgApr = totalDebt > 0 ? debtAccounts.reduce((sum, a) => sum + (a.apr * a.balance), 0) / totalDebt : 0;

    // Simulation Engine
    const simulation = useMemo(() => {
        if (totalDebt === 0) return null;

        let debts = debtAccounts.map(d => ({ ...d })); // Clone
        let months = 0;
        let totalInterestPaid = 0;
        let history = [{ month: 0, balance: totalDebt }];
        const MAX_MONTHS = 120; // Cap at 10 years to prevent infinite loops

        while (debts.some(d => d.balance > 0) && months < MAX_MONTHS) {
            months++;
            let monthlyBudget = totalMinPayment + extraPayment;
            let currentMonthInterest = 0;

            // 1. Add Interest
            debts.forEach(d => {
                if (d.balance > 0) {
                    const interest = d.balance * (d.apr / 100 / 12);
                    d.balance += interest;
                    currentMonthInterest += interest;
                    totalInterestPaid += interest;
                }
            });

            // 2. Pay Minimums first
            debts.forEach(d => {
                if (d.balance > 0) {
                    const pay = Math.min(d.balance, d.minPayment);
                    d.balance -= pay;
                    monthlyBudget -= pay;
                }
            });

            // 3. Pay Extra based on Strategy
            if (monthlyBudget > 0) {
                // Sort eligible debts
                const sortedDebts = debts.filter(d => d.balance > 0).sort((a, b) => {
                    if (strategy === "AVALANCHE") return b.apr - a.apr; // High interest first
                    return a.balance - b.balance; // Low balance first (Snowball)
                });

                for (let d of sortedDebts) {
                    if (monthlyBudget <= 0) break;
                    const pay = Math.min(d.balance, monthlyBudget);
                    d.balance -= pay;
                    monthlyBudget -= pay;
                }
            }

            history.push({ month: months, balance: Math.round(debts.reduce((sum, d) => sum + d.balance, 0)) });
        }

        const payoffDate = new Date();
        payoffDate.setMonth(payoffDate.getMonth() + months);

        return { months, totalInterestPaid, payoffDate, history };

    }, [debtAccounts, extraPayment, strategy, totalMinPayment, totalDebt]);

    // Cashflow Calendar Data
    const calendarEvents = useMemo(() => {
        const events: any[] = [];
        accounts.forEach(a => {
            if (a.dueDay) {
                events.push({ day: a.dueDay, type: 'payment', account: a.name, amount: a.minPayment || 0 });
            }
            if (a.closingDay) {
                events.push({ day: a.closingDay, type: 'closing', account: a.name });
            }
        });
        return events.sort((a, b) => a.day - b.day);
    }, [accounts]);

    if (debtAccounts.length === 0) {
        return (
            <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="bg-emerald-100 p-6 rounded-full mb-6 text-emerald-600">
                    <ShieldCheck size={64} />
                </div>
                <h2 className="text-3xl font-bold text-slate-800">¡Estás libre de deuda!</h2>
                <p className="text-slate-500 max-w-md mt-2">No detectamos tarjetas de crédito o préstamos con saldo negativo. Es el momento perfecto para enfocarte en Inversión y Ahorro.</p>
                <button
                    onClick={() => onNavigate('budget')}
                    className="mt-8 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">
                    Configurar Metas de Ahorro
                </button>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                        <TrendingDown size={24} />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Debt Crusher</h1>
                </div>
                <p className="text-slate-500">Simulador estratégico para eliminación de deuda y proyección 2026.</p>
            </header>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Deuda Total</p>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(totalDebt)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tasa Promedio (APR)</p>
                    <p className="text-3xl font-bold text-slate-900">{avgApr.toFixed(1)}%</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha Libertad</p>
                    <p className="text-2xl font-bold text-indigo-600">
                        {simulation?.payoffDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">en {simulation?.months} meses</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Interés Total Proyectado</p>
                    <p className="text-2xl font-bold text-rose-600">{formatCurrency(simulation?.totalInterestPaid || 0)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Simulator Controls */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Zap size={18} className="text-amber-500" /> Configurar Estrategia
                        </h3>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Pago Extra Mensual: <span className="text-emerald-600">{formatCurrency(extraPayment)}</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="2000"
                                step="50"
                                value={extraPayment}
                                onChange={(e) => setExtraPayment(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <p className="text-xs text-slate-400 mt-2">
                                Adicional a tus mínimos de {formatCurrency(totalMinPayment)}.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-bold text-slate-700">Método de Pago</label>
                            <button
                                onClick={() => setStrategy("AVALANCHE")}
                                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${strategy === 'AVALANCHE' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div className="text-left">
                                    <div className="font-bold text-slate-800 text-sm">Método Avalancha</div>
                                    <div className="text-xs text-slate-500">Paga la tasa más alta primero. Matemáticamente superior.</div>
                                </div>
                                {strategy === 'AVALANCHE' && <CheckCircle size={18} className="text-indigo-600" />}
                            </button>

                            <button
                                onClick={() => setStrategy("SNOWBALL")}
                                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${strategy === 'SNOWBALL' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div className="text-left">
                                    <div className="font-bold text-slate-800 text-sm">Bola de Nieve</div>
                                    <div className="text-xs text-slate-500">Paga la deuda más pequeña primero. Gana motivación rápida.</div>
                                </div>
                                {strategy === 'SNOWBALL' && <CheckCircle size={18} className="text-indigo-600" />}
                            </button>
                        </div>
                    </div>

                    {/* Cashflow Calendar Preview */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Calendar size={18} className="text-indigo-600" /> Próximos Vencimientos
                        </h3>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto">
                            {calendarEvents.map((evt: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center font-bold text-xs ${evt.type === 'payment' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                                        <span>DIA</span>
                                        <span className="text-sm">{evt.day}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-slate-700">{evt.account}</div>
                                        <div className="text-xs text-slate-500">{evt.type === 'payment' ? 'Fecha Límite Pago' : 'Corte de Tarjeta'}</div>
                                    </div>
                                    {evt.amount > 0 && (
                                        <div className="font-mono text-sm font-bold text-slate-600">{formatCurrency(evt.amount)}</div>
                                    )}
                                </div>
                            ))}
                            {calendarEvents.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Configura las fechas de corte/pago en tus cuentas.</p>}
                        </div>
                    </div>
                </div>

                {/* Chart Visualization */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px]">
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <TrendingUp size={18} className="text-emerald-600" /> Proyección de Saldo (Ruta hacia la Libertad)
                        </h3>
                        <ResponsiveContainer width="100%" height="90%">
                            <AreaChart data={simulation?.history}>
                                <defs>
                                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={(val) => `Mes ${val}`} />
                                <YAxis tick={{ fontSize: 12 }} tickFormatter={(val) => `$${val / 1000}k`} />
                                <Tooltip formatter={(val: number) => formatCurrency(val)} labelFormatter={(val) => `Mes ${val}`} />
                                <Area type="monotone" dataKey="balance" stroke="#6366f1" fillOpacity={1} fill="url(#colorBalance)" strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Breakdown by Debt */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4">Detalle de Deudas Activas</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 rounded-l-lg">Cuenta</th>
                                        <th className="px-4 py-3 text-right">Saldo</th>
                                        <th className="px-4 py-3 text-right">Tasa (APR)</th>
                                        <th className="px-4 py-3 text-right">Min. Pago</th>
                                        <th className="px-4 py-3 text-right rounded-r-lg">Prioridad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {debtAccounts
                                        .sort((a, b) => strategy === 'AVALANCHE' ? b.apr - a.apr : a.balance - b.balance)
                                        .map((acc, idx) => (
                                            <tr key={acc.id} className={idx === 0 ? "bg-indigo-50/50" : ""}>
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {idx === 0 && <span className="mr-2 inline-block w-2 h-2 rounded-full bg-indigo-500"></span>}
                                                    {acc.name}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(acc.balance)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${acc.apr > 20 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {acc.apr}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(acc.minPayment)}</td>
                                                <td className="px-4 py-3 text-right font-bold text-indigo-600">#{idx + 1}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
