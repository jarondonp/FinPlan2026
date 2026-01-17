import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShieldCheck, TrendingDown, Zap, Calendar, TrendingUp, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useGlobalFilter } from '../../context/GlobalFilterContext'; // Fixed Import
import { useAccountBalance } from '../../hooks/useAccountBalance';
import { debtService, PaymentPlanItem } from '../../services/DebtService';
import { useAuth } from '../../context/AuthContext';

interface PlanningModuleProps {
    onNavigate: (view: string) => void;
}

export const PlanningModule = ({ onNavigate }: PlanningModuleProps) => {
    const { filterState } = useGlobalFilter(); // Use correct context
    const { scope } = filterState;
    const { user } = useAuth();

    // Data
    const accounts = useAccountBalance(scope);

    // State
    const [extraPayment, setExtraPayment] = useState(200);
    const [strategy, setStrategy] = useState<"AVALANCHE" | "SNOWBALL">("AVALANCHE");
    const [plan, setPlan] = useState<PaymentPlanItem[]>([]);
    const [statusMap, setStatusMap] = useState<Map<string, number>>(new Map()); // AccountId -> Amount Paid This Month
    const [isLoading, setIsLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [manualAllocations, setManualAllocations] = useState<{ [key: string]: number }>({});

    // Helper to save immediately
    const saveSettings = async (newExtra: number, newStrategy: "AVALANCHE" | "SNOWBALL", newAllocations: { [key: string]: number }) => {
        if (!user) return;
        setSaveStatus('saving');
        try {
            await debtService.saveDebtSettings(user.uid, {
                extraPayment: newExtra,
                strategy: newStrategy,
                manualAllocations: newAllocations
            });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            console.error("Failed to save debt settings", e);
            setSaveStatus('idle');
        }
    };

    // 1. Load Settings on Mount
    useEffect(() => {
        if (!user) return;
        debtService.getDebtSettings(user.uid).then(settings => {
            setExtraPayment(settings.extraPayment);
            setStrategy(settings.strategy);
            setManualAllocations(settings.manualAllocations || {});
        });
    }, [user]);

    // Filter Eligible Debt Accounts
    const debtAccounts = useMemo(() => {
        return accounts.filter(a =>
            (a.type === 'Credit Card' || a.type === 'Loan') &&
            Math.abs(a.dynamicBalance || 0) > 1
        );
    }, [accounts]);

    // 1. Calculate Plan on change
    useEffect(() => {
        if (debtAccounts.length > 0) {
            console.log(`🔧 debtAccounts count: ${debtAccounts.length}`, debtAccounts.map(a => `${a.name}: balance=${a.dynamicBalance}`));

            // Total budget = Sum of Minimums + Extra
            // We need to calculate total minimums first to know the base.
            const totalMin = debtAccounts.reduce((sum, a) => sum + (a.minPayment || Math.abs(a.dynamicBalance) * 0.02), 0);

            // Generate Plan
            console.log(`🔧 CALLING calculatePaymentPlan with totalMin=${totalMin}, extraPayment=${extraPayment}, strategy=${strategy}`);
            console.log(`🔧 manualAllocations=`, manualAllocations);

            const generatedPlan = debtService.calculatePaymentPlan(
                debtAccounts,
                totalMin + extraPayment,
                strategy,
                manualAllocations
            );

            console.log(`🔧 RESULT from calculatePaymentPlan:`, generatedPlan.map(p => `${p.accountName}: extra=${p.extraAllocation}`));

            // CRITICAL FIX: Don't overwrite valid plan with empty result
            if (generatedPlan.length > 0) {
                setPlan(generatedPlan);
            } else {
                console.warn('⚠️ Empty result, keeping previous plan');
            }
        } else {
            setPlan([]);
        }
    }, [accounts.length, extraPayment, strategy, manualAllocations]);

    const handleManualAllocationChange = (accountId: string, value: string) => {
        const num = parseFloat(value) || 0;
        const newAllocations = { ...manualAllocations };

        // Delete entry if empty string OR if value is 0
        // This ensures the lock is completely removed
        if (value === '' || num === 0) {
            delete newAllocations[accountId];
        } else {
            newAllocations[accountId] = num;
        }

        setManualAllocations(newAllocations);
    };

    const handleManualBlur = () => {
        saveSettings(extraPayment, strategy, manualAllocations);
    };

    // 2. Fetch Status
    useEffect(() => {
        const fetchStatus = async () => {
            if (!user || debtAccounts.length === 0) return;
            setIsLoading(true);
            const today = new Date();
            const monthStr = today.toISOString().slice(0, 7); // YYYY-MM

            const results = await debtService.fetchActualPayments(
                user.uid,
                monthStr,
                debtAccounts.map(a => a.id)
            );
            setStatusMap(results);
            setIsLoading(false);
        };
        fetchStatus();
    }, [debtAccounts, user]);

    // Derived Stats
    const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.dynamicBalance), 0);
    const totalMinPayment = debtAccounts.reduce((sum, a) => sum + (a.minPayment || Math.abs(a.dynamicBalance) * 0.02), 0);
    const totalMonthlyCommitment = totalMinPayment + extraPayment;

    // Recovery Calculation
    const recoveryBreakdown = useMemo(() => {
        return debtAccounts.reduce((acc, account) => {
            const balance = Math.abs(account.dynamicBalance);
            const configuredMin = account.minPayment || (balance * 0.02);
            const actualMin = Math.min(configuredMin, balance);
            const diff = configuredMin - actualMin; // Money saved because debt < min_payment

            if (diff > 0.009) {
                acc.total += diff;
                acc.sources.push({ name: account.name, amount: diff });
            }
            return acc;
        }, { total: 0, sources: [] as { name: string, amount: number }[] });
    }, [debtAccounts]);

    // Simulation logic (Simpler version for chart)
    const simulationData = useMemo(() => {
        if (totalDebt === 0) return [];
        let balance = totalDebt;
        const history = [{ month: 0, balance }];
        const monthlyRate = 0.20 / 12; // Avg 20% APR assumption for quick chart

        for (let i = 1; i <= 60; i++) {
            const interest = balance * monthlyRate;
            balance = Math.max(0, balance + interest - totalMonthlyCommitment);
            history.push({ month: i, balance: Math.round(balance) });
            if (balance <= 0) break;
        }
        return history;

    }, [totalDebt, totalMonthlyCommitment]);


    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header / Strategy Control */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ShieldCheck className="text-indigo-600" /> Centro de Comando de Deuda
                    </h2>
                    <p className="text-slate-500 text-sm">Gestiona y elimina tus pasivos con estrategia.</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => { setStrategy("AVALANCHE"); saveSettings(extraPayment, "AVALANCHE", manualAllocations); }}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${strategy === "AVALANCHE" ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <TrendingDown size={16} className="inline mr-1" /> Avalancha (Interés)
                    </button>
                    <button
                        onClick={() => { setStrategy("SNOWBALL"); saveSettings(extraPayment, "SNOWBALL", manualAllocations); }}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${strategy === "SNOWBALL" ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Zap size={16} className="inline mr-1" /> Bola de Nieve (Saldo)
                    </button>
                </div>
            </div>

            {/* Main Action Board */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Input & Summary */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Configuración Mensual</h3>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Pago Extra Disponible</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input
                                    type="number"
                                    value={extraPayment}
                                    onChange={(e) => setExtraPayment(parseFloat(e.target.value) || 0)}
                                    onBlur={() => saveSettings(extraPayment, strategy, manualAllocations)}
                                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div className="h-4 mt-1 text-right">
                                {saveStatus === 'saving' && <span className="text-xs text-indigo-500 font-medium animate-pulse">Guardando...</span>}
                                {saveStatus === 'saved' && <span className="text-xs text-emerald-500 font-medium flex justify-end items-center gap-1"><CheckCircle size={12} /> Guardado</span>}
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                + Mínimos ({formatCurrency(totalMinPayment)}) =
                                <span className="font-bold text-indigo-600 ml-1">Total {formatCurrency(totalMonthlyCommitment)}</span>
                            </p>

                            {/* Optimization Breakdown */}
                            {recoveryBreakdown.total > 0 && (
                                <div className="mt-4 bg-emerald-50 border border-emerald-100 p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center text-emerald-800 font-bold mb-1">
                                        <span className="flex items-center gap-1"><Zap size={14} /> Optimizador Activo</span>
                                        <span>+{formatCurrency(recoveryBreakdown.total)}</span>
                                    </div>
                                    <p className="text-emerald-600 text-xs mb-2 leading-relaxed">
                                        Detectamos mínimos configurados que exceden la deuda real. Recuperamos ese dinero para tu plan:
                                    </p>
                                    <ul className="space-y-1 max-h-32 overflow-y-auto">
                                        {recoveryBreakdown.sources.map(source => (
                                            <li key={source.name} className="flex justify-between text-xs text-emerald-700 bg-emerald-100/50 px-2 py-1 rounded">
                                                <span className="truncate max-w-[140px]" title={source.name}>{source.name}</span>
                                                <span className="font-mono">+{formatCurrency(source.amount)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 pt-6 border-t border-slate-100">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Deuda Total</span>
                                <span className="font-mono font-bold text-slate-800">{formatCurrency(totalDebt)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Tiempo Estimado</span>
                                <span className="font-bold text-emerald-600 flex items-center gap-1">
                                    <Calendar size={14} /> {simulationData.length} Meses
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-64">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Proyección</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={simulationData}>
                                <defs>
                                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" hide />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    formatter={(value: number) => formatCurrency(value)}
                                    labelFormatter={(label) => `Mes ${label}`}
                                />
                                <Area type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorBal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right: Payment Plan Table */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Plan de Acción - {new Date().toLocaleDateString('es-ES', { month: 'long' })}</h3>
                            <p className="text-sm text-slate-500">Sigue este orden para maximizar tu impacto.</p>
                        </div>
                        {strategy === 'AVALANCHE' ? (
                            <span className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-full font-bold border border-indigo-100">Prioridad: Interés Alto</span>
                        ) : (
                            <span className="bg-sky-50 text-sky-700 text-xs px-3 py-1 rounded-full font-bold border border-sky-100">Prioridad: Saldo Pequeño</span>
                        )}
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <th className="p-4 font-bold">Cuenta</th>
                                    <th className="p-4 font-bold text-right">Saldo Actual</th>
                                    <th className="p-4 font-bold text-right text-slate-400">Mínimo</th>
                                    <th className="p-4 font-bold text-right text-indigo-600 group relative cursor-help">
                                        + Extra
                                        {recoveryBreakdown.total > 0 && (
                                            <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                                <div className="font-bold mb-1 border-b border-slate-600 pb-1">Desglose de Fondos:</div>
                                                <div className="flex justify-between">
                                                    <span>Tu Aporte:</span>
                                                    <span>{formatCurrency(extraPayment)}</span>
                                                </div>
                                                <div className="flex justify-between text-emerald-400">
                                                    <span>Optimizador:</span>
                                                    <span>+{formatCurrency(recoveryBreakdown.total)}</span>
                                                </div>
                                                <div className="flex justify-between font-bold pt-1 mt-1 border-t border-slate-600">
                                                    <span>Total:</span>
                                                    <span>{formatCurrency(extraPayment + recoveryBreakdown.total)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </th>
                                    <th className="p-4 font-bold text-right bg-slate-100/50">Total a Pagar</th>
                                    <th className="p-4 font-bold text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {plan.map((item, index) => {
                                    const paidAmount = statusMap.get(item.accountId) || 0;
                                    const isPaid = paidAmount >= item.totalSuggested * 0.95; // 5% tolerance
                                    const progress = Math.min(100, (paidAmount / item.totalSuggested) * 100);

                                    console.log(`🖥️ RENDER ${item.accountName}: extra=${item.extraAllocation}, total=${item.totalSuggested}`);

                                    return (
                                        <tr key={item.accountId} className={`hover:bg-slate-50 transition-colors ${index === 0 ? 'bg-indigo-50/10' : ''}`}>
                                            <td className="p-4 font-bold text-slate-700 flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                    {index + 1}
                                                </div>
                                                {item.accountName}
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-600">{formatCurrency(parseFloat(item.currentBalance))}</td>
                                            <td className="p-4 text-right font-mono text-slate-400">{formatCurrency(item.minPayment)}</td>
                                            <td className="p-4 text-right font-mono font-bold text-indigo-600 relative group">
                                                {/* Determine if clamped */}
                                                {(() => {
                                                    const userRequest = manualAllocations[item.accountId] || 0;
                                                    const actualAllocation = item.extraAllocation || 0;
                                                    const isClamped = item.isLocked && userRequest > actualAllocation + 0.5;

                                                    return (
                                                        <>
                                                            {item.isLocked && (
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-amber-500" title="Bloqueado Manualmente">🔒</span>
                                                            )}
                                                            {isClamped && (
                                                                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-red-500 animate-pulse" title={`Fondos Insuficientes. Pediste $${userRequest}, pero solo se asignaron $${actualAllocation.toFixed(2)}.`}>
                                                                    <AlertTriangle size={14} />
                                                                </span>
                                                            )}
                                                            {!item.isLocked && (
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 text-xs">✏️</span>
                                                            )}

                                                            <input
                                                                type="number"
                                                                value={manualAllocations[item.accountId] || (item.extraAllocation || '')}
                                                                placeholder={item.extraAllocation > 0 ? `+${item.extraAllocation.toFixed(2)}` : '-'}
                                                                onChange={(e) => handleManualAllocationChange(item.accountId, e.target.value)}
                                                                onBlur={handleManualBlur}
                                                                className={`w-28 text-right bg-transparent outline-none border-b transition-all 
                                                                    ${isClamped ? 'border-red-500 text-red-600 bg-red-50 font-bold rounded px-1' :
                                                                        item.isLocked ? 'border-amber-300 text-amber-600 font-bold bg-amber-50/50 rounded px-1' :
                                                                            'border-transparent focus:border-indigo-500 text-indigo-600 placeholder-indigo-300'}
                                                                `}
                                                            />
                                                        </>
                                                    );
                                                })()}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-slate-800 bg-slate-100/30 text-base">
                                                {formatCurrency(item.totalSuggested)}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    {isPaid ? (
                                                        <span className="text-emerald-600 font-bold text-xs flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                                                            <CheckCircle size={12} /> Pagado
                                                        </span>
                                                    ) : (
                                                        <div className="w-24">
                                                            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                                                <span>{formatCurrency(paidAmount)}</span>
                                                                <span>{progress.toFixed(0)}%</span>
                                                            </div>
                                                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                <div className={`h-full rounded-full transition-all ${progress > 0 ? 'bg-amber-400' : 'bg-transparent'}`} style={{ width: `${progress}%` }}></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {plan.length === 0 && (
                            <div className="p-12 text-center text-slate-400">
                                <ShieldCheck size={48} className="mx-auto text-slate-200 mb-4" />
                                <p>¡Felicidades! No se detectaron deudas activas.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
