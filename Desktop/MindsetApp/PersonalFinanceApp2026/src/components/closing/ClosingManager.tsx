import React, { useEffect, useState } from 'react';
// import { useLiveQuery } from 'dexie-react-hooks'; // Removed
// import { db } from '../../db/db'; // Removed
import { closingService } from '../../services/ClosingService';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { formatMonth } from '../../utils';
import { Lock, Unlock, AlertTriangle, CheckCircle, ChevronRight, RotateCcw } from 'lucide-react';
import { ClosingWizard } from './ClosingWizard';

export const ClosingManager = () => {
    const { filterState } = useGlobalFilter();
    const { scope } = filterState;
    const [currentStatus, setCurrentStatus] = useState<'OPEN' | 'CLOSED' | 'LOCKED'>('OPEN');
    const [canClose, setCanClose] = useState<{ allowed: boolean, reason?: string }>({ allowed: true });

    // Wizard State
    const [wizardTargetDate, setWizardTargetDate] = useState<Date | null>(null);

    // Refresh mechanism to sync Left/Right panels
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const forceRefresh = () => setRefreshTrigger(prev => prev + 1);

    // Watch current month status
    const monthDate = filterState.timeframe.start;

    useEffect(() => {
        const check = async () => {
            const status = await closingService.getStatus(monthDate, scope);
            const permission = await closingService.canClose(monthDate, scope);
            setCurrentStatus(status);
            setCanClose(permission);
        };
        check();
    }, [monthDate, scope, refreshTrigger]); // Added refreshTrigger

    const handleCloseMonth = (targetDate: Date) => {
        // Instead of immediate close, open Wizard
        setWizardTargetDate(targetDate);
    };

    const onWizardSuccess = () => {
        alert("Mes cerrado exitosamente.");
        setWizardTargetDate(null);
        forceRefresh();
    };

    const handleReopenMonth = async (targetDate: Date) => {
        if (!confirm(`¿Seguro que deseas REABRIR el mes de ${formatMonth(targetDate)}?\n\nEsto permitirá editar transacciones nuevamente.`)) return;
        try {
            await closingService.reopenMonth(targetDate, scope);
            alert("Mes reabierto exitosamente.");
            forceRefresh(); // Trigger global UI update
        } catch (e: any) {
            alert(e.message);
        }
    };

    // Generate Month List starting Dec 2025
    const months = [
        new Date(2025, 11, 1), // Dec 2025
        new Date(2026, 0, 1),  // Jan 2026
        new Date(2026, 1, 1),  // Feb 2026
        new Date(2026, 2, 1),  // Mar 2026
        new Date(2026, 3, 1),  // Apr 2026
        new Date(2026, 4, 1),  // May 2026
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
            {/* Left Column: Rules & Current Status */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Lock size={18} className="text-slate-400" />
                        Cierre de Periodo
                    </h3>

                    <div className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Reglas de Integridad</div>
                    <ul className="space-y-3 mb-6">
                        <li className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded text-xs font-bold mt-0.5">1</span>
                            <span>No puedes cerrar un mes si el mes anterior sigue abierto. (Secuencialidad)</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded text-xs font-bold mt-0.5">2</span>
                            <span>Al cerrar un mes, los saldos se congelan y no podrás editar transacciones pasadas.</span>
                        </li>
                    </ul>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mes Seleccionado</div>
                        <h2 className="text-xl font-bold text-indigo-900 capitalize mb-1">{formatMonth(monthDate)}</h2>
                        <div className="flex items-center gap-2 mb-4">
                            {currentStatus === 'OPEN' ? (
                                <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                    <Unlock size={14} /> Abierto
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-slate-600 text-sm font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                    <Lock size={14} /> Cerrado
                                </span>
                            )}
                        </div>

                        {currentStatus === 'OPEN' && (
                            <button
                                onClick={() => handleCloseMonth(monthDate)}
                                disabled={!canClose.allowed}
                                className={`w-full py-2.5 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2
                                    ${canClose.allowed
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                            >
                                <Lock size={16} />
                                Cerrar este Mes
                            </button>
                        )}
                        {!canClose.allowed && currentStatus === 'OPEN' && (
                            <div className="mt-3 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-100 flex items-start gap-2">
                                <AlertTriangle size={14} className="min-w-[14px] mt-0.5" />
                                {canClose.reason}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Month Calendar Table */}
            <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800">Calendario de Cierres</h3>
                        <p className="text-slate-500 text-sm">Historial de estados por mes (Inicio: Dic 2025)</p>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-3">Periodo</th>
                                <th className="px-6 py-3">Estado</th>
                                <th className="px-6 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {months.map(m => (
                                <MonthRow
                                    key={m.toISOString()}
                                    date={m}
                                    scope={scope}
                                    refreshTrigger={refreshTrigger}
                                    onClose={() => handleCloseMonth(m)}
                                    onReopen={() => handleReopenMonth(m)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Wizard Modal */}
            {wizardTargetDate && (
                <ClosingWizard
                    monthDate={wizardTargetDate}
                    scope={scope}
                    onClose={() => setWizardTargetDate(null)}
                    onSuccess={onWizardSuccess}
                />
            )}
        </div>
    );
};

const MonthRow = ({ date, scope, onClose, onReopen, refreshTrigger }: any) => {
    const [status, setStatus] = useState<string>('LOADING');
    const [canClose, setCanClose] = useState(false);

    const load = async () => {
        const s = await closingService.getStatus(date, scope);
        const check = await closingService.canClose(date, scope);
        setStatus(s);
        setCanClose(check.allowed);
    };

    useEffect(() => {
        load();
    }, [date, scope, refreshTrigger]); // Listen to refreshTrigger

    const isCurrentMonth = new Date().toISOString().slice(0, 7) === date.toISOString().slice(0, 7);

    return (
        <tr className={`hover:bg-slate-50 transition-colors ${isCurrentMonth ? 'bg-indigo-50/50' : ''}`}>
            <td className="px-6 py-4 font-medium text-slate-900 capitalize">
                {formatMonth(date)}
                {isCurrentMonth && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">Actual</span>}
            </td>
            <td className="px-6 py-4">
                {status === 'OPEN' ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 w-fit">
                        <Unlock size={12} /> Abierto
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 text-slate-500 text-xs font-bold bg-slate-100 px-2 py-1 rounded-full border border-slate-200 w-fit">
                        <Lock size={12} /> Cerrado
                    </span>
                )}
            </td>
            <td className="px-6 py-4 text-right">
                {status === 'OPEN' && (
                    <button
                        onClick={onClose}
                        disabled={!canClose}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${canClose
                            ? 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300'
                            : 'bg-slate-50 border-transparent text-slate-300 cursor-not-allowed'}`}
                    >
                        Cerrar Mes
                    </button>
                )}
                {status !== 'OPEN' && (
                    <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                            <CheckCircle size={12} /> Auditado
                        </span>
                        <button
                            onClick={onReopen}
                            title="Reabrir mes (Solo si es el último cerrado)"
                            className="text-slate-400 hover:text-amber-600 transition-colors p-1"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                )}
            </td>
        </tr>
    )
}
