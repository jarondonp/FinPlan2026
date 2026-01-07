import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { closingService } from '../../services/ClosingService';
import { budgetService } from '../../services/BudgetService';
import { Account, Scope } from '../../types';
import { Loader2, CheckCircle, AlertTriangle, ArrowRight, X, Calculator, RotateCcw, Wallet2 } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface ClosingWizardProps {
    monthDate: Date;
    scope: Scope;
    onClose: () => void;
    onSuccess: () => void;
}

export const ClosingWizard = ({ monthDate, scope, onClose, onSuccess }: ClosingWizardProps) => {
    const [step, setStep] = useState<'VERIFY_ACCOUNTS' | 'VERIFY_BUDGET' | 'SUMMARY'>('VERIFY_ACCOUNTS');
    const [loading, setLoading] = useState(false);

    // Fetch Accounts
    const accounts = useLiveQuery(() => db.accounts
        .filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope))
        .toArray(), [scope]) || [];

    // Local State for verification
    // Map accountId -> { calculated: number, real: number | null, status: 'PENDING' | 'MATCH' | 'MISMATCH' }
    const [verificationMap, setVerificationMap] = useState<Record<string, any>>({});
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
    const [inputBalance, setInputBalance] = useState("");

    // Budget Verification State (WAM)
    const [budgetHealth, setBudgetHealth] = useState<any>(null);
    const [wamActiveCategory, setWamActiveCategory] = useState<string | null>(null);
    const [wamSource, setWamSource] = useState("");

    // Initialize map
    useEffect(() => {
        const init = async () => {
            // Calculate end of month date for balance check
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            const lastDay = new Date(year, month + 1, 0); // Last day of month

            const map: any = {};

            // Load drafts
            const storageKey = `CLOSING_DRAFT_${scope}_${monthDate.toISOString().slice(0, 7)}`;
            const savedDrafts = JSON.parse(localStorage.getItem(storageKey) || '{}');

            for (const acc of accounts) {
                const bal = await closingService.getAccountBalance(acc.id, lastDay);

                // Check if we have a saved verification for this account
                const savedReal = savedDrafts[acc.id];
                const hasSaved = typeof savedReal === 'number';

                let status = 'PENDING';
                let diff = 0;

                if (hasSaved) {
                    diff = savedReal - bal;
                    status = Math.abs(diff) < 0.01 ? 'MATCH' : 'MISMATCH';
                }

                map[acc.id] = {
                    name: acc.name,
                    calculated: bal,
                    real: hasSaved ? savedReal : null,
                    status: status,
                    diff: diff
                };
            }
            setVerificationMap(map);

            // Fetch Budget Health
            const health = await budgetService.getBudgetHealth(monthDate, scope);
            setBudgetHealth(health);
        };
        if (accounts.length > 0) init();
    }, [accounts, monthDate, scope]);

    // Actions
    const handleVerify = (accountId: string) => {
        setActiveAccountId(accountId);
        setInputBalance("");
    };

    const submitBalance = () => {
        if (!activeAccountId) return;
        const real = parseFloat(inputBalance);
        if (isNaN(real)) return alert("Ingresa un número válido");

        const current = verificationMap[activeAccountId];
        const diff = real - current.calculated;
        const isMatch = Math.abs(diff) < 0.01;

        // Persist to LocalStorage
        const storageKey = `CLOSING_DRAFT_${scope}_${monthDate.toISOString().slice(0, 7)}`;
        const currentDrafts = JSON.parse(localStorage.getItem(storageKey) || '{}');
        currentDrafts[activeAccountId] = real;
        localStorage.setItem(storageKey, JSON.stringify(currentDrafts));

        setVerificationMap({
            ...verificationMap,
            [activeAccountId]: {
                ...current,
                real,
                diff,
                status: isMatch ? 'MATCH' : 'MISMATCH'
            }
        });
        setActiveAccountId(null);
    };

    const handleAutoAdjust = async (accountId: string) => {
        const item = verificationMap[accountId];
        if (!item || item.status !== 'MISMATCH') return;

        // GENESIS CHECK: Dec 2025 is the genesis month
        const isGenesis = isGenesisMonth(monthDate);

        // Removed confirm dialog - auto-execute reconstruction
        // Calculate Last Day
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const lastDay = new Date(year, month + 1, 0);

        try {
            if (isGenesis) {
                // Option 1: Reconstruct Initial Balance
                await closingService.reconstructInitialBalance(accountId, item.real, lastDay);
            } else {
                // Option 2: Create Adjustment Transaction
                await closingService.createBalanceAdjustment(accountId, item.diff, lastDay, scope);
            }

            // Refresh calculation
            const newBal = await closingService.getAccountBalance(accountId, lastDay);

            setVerificationMap({
                ...verificationMap,
                [accountId]: {
                    ...item,
                    calculated: newBal, // Should now equal item.real
                    diff: item.real - newBal,
                    status: 'MATCH' // Should assume match now
                }
            });
        } catch (error: any) {
            alert(`Error al reconstruir: ${error.message}`);
        }

        // Update storage just in case (though real didn't change, status logic depends on calculated)
        // No need to change storage because 'real' is what we store.
    };

    // WAM Actions
    const handleResolveWam = async () => {
        if (!wamActiveCategory || !wamSource) return;

        const categoryData = budgetHealth.overspentCategories.find((c: any) => c.category === wamActiveCategory);
        if (!categoryData) return;

        const needed = Math.abs(categoryData.available); // Amount to cover

        await budgetService.moveFunds(wamSource, wamActiveCategory, needed, monthDate, scope);

        // Refresh Health
        const health = await budgetService.getBudgetHealth(monthDate, scope);
        setBudgetHealth(health);

        setWamActiveCategory(null);
        setWamSource("");
    };

    // Helper for Genesis Check (Dec 2025)
    const isGenesisMonth = (date: Date) => {
        return date.getFullYear() === 2025 && date.getMonth() === 11; // Dec 2025
    };

    // Derived
    const allVerified = Object.values(verificationMap).every((v: any) => v.status === 'MATCH');
    const pendingCount = Object.values(verificationMap).filter((v: any) => v.status === 'PENDING').length;
    const mismatchCount = Object.values(verificationMap).filter((v: any) => v.status === 'MISMATCH').length;

    const finalizeClose = async () => {
        setLoading(true);
        try {
            await closingService.closeMonth(monthDate, scope, "Cierre Verificado");
            // Clear draft on success
            const storageKey = `CLOSING_DRAFT_${scope}_${monthDate.toISOString().slice(0, 7)}`;
            localStorage.removeItem(storageKey);

            onSuccess();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Cierre de {monthDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</h2>
                        <p className="text-sm text-slate-500">Verificación de Saldos Bancarios</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    {step === 'VERIFY_ACCOUNTS' && (
                        <div className="space-y-4">
                            <div className="flex gap-4 mb-6">
                                <div className="flex-1 bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                                    <h4 className="text-blue-800 font-bold text-2xl">{accounts.length}</h4>
                                    <p className="text-xs text-blue-600 uppercase font-bold">Total Cuentas</p>
                                </div>
                                <div className="flex-1 bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                                    <h4 className="text-emerald-800 font-bold text-2xl">{Object.values(verificationMap).filter((v: any) => v.status === 'MATCH').length}</h4>
                                    <p className="text-xs text-emerald-600 uppercase font-bold">Verificadas</p>
                                </div>
                                <div className="flex-1 bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                                    <h4 className="text-amber-800 font-bold text-2xl">{mismatchCount}</h4>
                                    <p className="text-xs text-amber-600 uppercase font-bold">Descuadres</p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-600 mb-4 font-medium">Por favor confirma el saldo final de cada cuenta según tu banco:</p>

                            <div className="space-y-3">
                                {accounts.map(acc => {
                                    const state = verificationMap[acc.id];
                                    if (!state) return <div key={acc.id} className="animate-pulse bg-slate-100 h-16 rounded-xl"></div>;

                                    const isEditing = activeAccountId === acc.id;

                                    return (
                                        <div key={acc.id} className={`border-2 rounded-xl transition-all ${state.status === 'MATCH' ? 'border-emerald-100 bg-emerald-50/30' : state.status === 'MISMATCH' ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'}`}>
                                            <div className="p-4 flex items-center justify-between">
                                                <div>
                                                    <h4 className="font-bold text-slate-800">{acc.name}</h4>
                                                    <p className="text-xs text-slate-500 font-mono">Sistema: {formatCurrency(state.calculated)}</p>
                                                </div>

                                                {isEditing ? (
                                                    <div className="flex items-center gap-2 animate-in slide-in-from-right">
                                                        <input
                                                            autoFocus
                                                            type="number"
                                                            className="w-32 p-2 border border-indigo-300 rounded-lg outline-none ring-2 ring-indigo-100"
                                                            placeholder="Saldo Banco"
                                                            value={inputBalance}
                                                            onChange={e => setInputBalance(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && submitBalance()}
                                                        />
                                                        <button onClick={submitBalance} className="bg-indigo-600 text-white p-2 rounded-lg font-bold text-sm">OK</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-4">
                                                        {state.status === 'PENDING' && (
                                                            <button onClick={() => handleVerify(acc.id)} className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                                                Verificar
                                                            </button>
                                                        )}
                                                        {state.status === 'MATCH' && (
                                                            <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                                                                <CheckCircle size={18} /> Cuadrado
                                                            </div>
                                                        )}
                                                        {state.status === 'MISMATCH' && (
                                                            <div className="text-right">
                                                                <div className="flex items-center gap-1 text-amber-700 font-bold text-sm">
                                                                    <AlertTriangle size={16} />
                                                                    Diff: {state.diff > 0 ? '+' : ''}{formatCurrency(state.diff)}
                                                                </div>
                                                                <button onClick={() => handleAutoAdjust(acc.id)} className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded flex items-center gap-1 mt-1 ml-auto transition-colors">
                                                                    <RotateCcw size={12} />
                                                                    {isGenesisMonth(monthDate) ? "Reconstruir Saldo Inicial" : "Ajustar"}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {step === 'VERIFY_BUDGET' && budgetHealth && (
                        <div className="space-y-6">
                            <div className="flex gap-4 mb-6">
                                <div className="flex-1 bg-rose-50 p-4 rounded-xl border border-rose-100 text-center">
                                    <h4 className="text-rose-800 font-bold text-2xl">{budgetHealth.overspentCategories.length}</h4>
                                    <p className="text-xs text-rose-600 uppercase font-bold">Categorías en Rojo</p>
                                </div>
                                <div className="flex-1 bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                                    <h4 className="text-emerald-800 font-bold text-2xl">{budgetHealth.healthyCategories.length}</h4>
                                    <p className="text-xs text-emerald-600 uppercase font-bold">Categorías Sanas</p>
                                </div>
                            </div>

                            {budgetHealth.hasOverspent ? (
                                <>
                                    <p className="text-sm text-slate-600 font-medium">
                                        Detectamos sobregiros en tu presupuesto. Para cerrar el mes, debes cubrir estos rojos moviendo dinero de categorías con superávit (Regla WAM).
                                    </p>
                                    <div className="space-y-3">
                                        {budgetHealth.overspentCategories.map((cat: any) => (
                                            <div key={cat.category} className="border-2 border-rose-100 bg-rose-50/30 p-4 rounded-xl flex items-center justify-between">
                                                <div>
                                                    <h4 className="font-bold text-slate-800">{cat.category}</h4>
                                                    <p className="text-xs text-rose-600 font-bold">Sobregiro: {formatCurrency(cat.available)}</p>
                                                </div>

                                                {wamActiveCategory === cat.category ? (
                                                    <div className="flex items-center gap-2 animate-in slide-in-from-right">
                                                        <select
                                                            className="text-sm border-slate-300 rounded-lg p-2 w-48"
                                                            value={wamSource}
                                                            onChange={e => setWamSource(e.target.value)}
                                                        >
                                                            <option value="">Cubrir desde...</option>
                                                            {budgetHealth.healthyCategories
                                                                .filter((c: any) => c.available >= Math.abs(cat.available))
                                                                .map((c: any) => (
                                                                    <option key={c.category} value={c.category}>
                                                                        {c.category} (+{formatCurrency(c.available)})
                                                                    </option>
                                                                ))}
                                                        </select>
                                                        <button
                                                            disabled={!wamSource}
                                                            onClick={handleResolveWam}
                                                            className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                                                        >
                                                            Cubrir
                                                        </button>
                                                        <button onClick={() => setWamActiveCategory(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setWamActiveCategory(cat.category)}
                                                        className="px-4 py-2 bg-rose-100/50 text-rose-700 hover:bg-rose-100 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                                                    >
                                                        <Wallet2 size={16} /> Cubrir
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-10">
                                    <div className="bg-emerald-100 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={32} />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2">¡Todo en Orden!</h3>
                                    <p className="text-slate-500">Tu presupuesto está balanceado. No hay categorías en rojo.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">
                        Cancelar
                    </button>
                    {step === 'VERIFY_ACCOUNTS' ? (
                        <button
                            onClick={() => setStep('VERIFY_BUDGET')}
                            disabled={!allVerified}
                            className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale flex items-center gap-2 transition-all"
                        >
                            Siguiente: Presupuesto <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={finalizeClose}
                            disabled={!allVerified || (budgetHealth && budgetHealth.hasOverspent) || loading}
                            className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale flex items-center gap-2 transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                            Confirmar y Cerrar Mes
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
