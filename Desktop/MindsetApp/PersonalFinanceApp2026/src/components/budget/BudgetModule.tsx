import React, { useState, useMemo } from 'react';
import { PiggyBank, Target, TrendingUp, AlertTriangle, Settings, Plus, Trash2, Eye, EyeOff, Info } from 'lucide-react';
// import { useLiveQuery } from 'dexie-react-hooks'; // Removed
// import { db } from '../../db/db'; // Removed
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { formatCurrency, getRandomColor, generateId } from '../../utils';
import { Goal, CategoryDef } from '../../types';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { closingService } from '../../services/ClosingService';

interface BudgetModuleProps {
    onNavigateToSettings: () => void;
}

export const BudgetModule = ({ onNavigateToSettings }: BudgetModuleProps) => {
    const { filterState } = useGlobalFilter();
    const { scope, timeframe } = filterState;
    const { user } = useAuth();

    // Cloud Data Fetching
    const { data: allTransactions } = useFirestore<any>('transactions');
    const transactions = (allTransactions || []).filter(t => t.scope === scope || (scope === 'PERSONAL' && !t.scope));

    const { data: allCategories } = useFirestore<CategoryDef>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    const { data: allGoals } = useFirestore<Goal>('goals');
    const goals = (allGoals || []).filter(g => g.scope === scope || (scope === 'PERSONAL' && !g.scope));

    const { data: allRecurring } = useFirestore<any>('recurringExpenses');
    const recurringExpenses = (allRecurring || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

    // State
    const [isAddingGoal, setIsAddingGoal] = useState(false);
    const [newGoal, setNewGoal] = useState<Partial<Goal>>({});
    const [isEditingBudgets, setIsEditingBudgets] = useState(false);
    const [isMonthClosed, setIsMonthClosed] = useState(false); // Protection state

    // Check Status
    React.useEffect(() => {
        const currentBudgetMonth = new Date(); // Today
        closingService.getStatus(currentBudgetMonth, scope).then(status => {
            setIsMonthClosed(status === 'CLOSED' || status === 'LOCKED');
        });
    }, [scope]);

    // Budget Calculations
    const currentDateRange = useMemo(() => {
        const start = timeframe.start ? new Date(timeframe.start) : new Date();
        const monthStr = start.toISOString().slice(0, 7); // YYYY-MM
        return {
            monthStr,
            startStr: timeframe.start,
            endStr: timeframe.end
        };
    }, [timeframe]);

    const budgetData = useMemo(() => {
        const spentMap: Record<string, number> = {};

        transactions
            .filter(t => {
                // Filter by date range from global context
                if (currentDateRange.startStr && currentDateRange.endStr) {
                    const tDate = t.date; // String YYYY-MM-DD
                    const start = currentDateRange.startStr instanceof Date ? currentDateRange.startStr.toISOString().split('T')[0] : currentDateRange.startStr;
                    const end = currentDateRange.endStr instanceof Date ? currentDateRange.endStr.toISOString().split('T')[0] : currentDateRange.endStr;
                    return tDate >= start && tDate <= end;
                }
                // Fallback to month string check
                return t.date.startsWith(currentDateRange.monthStr);
            })
            .filter(t => t.type === 'EXPENSE')
            .forEach(t => {
                spentMap[t.category] = (spentMap[t.category] || 0) + Math.abs(t.amount);
            });

        // Fixed Expenses Map (Sum of all active recurring expenses per category)
        const fixedMap: Record<string, number> = {};
        recurringExpenses.forEach(r => {
            if (r.active && r.category) {
                fixedMap[r.category] = (fixedMap[r.category] || 0) + r.amount;
            }
        });

        return categories
            .map(cat => ({
                ...cat,
                spent: spentMap[cat.name] || 0,
                limit: cat.budgetLimit || 0,
                minRequired: fixedMap[cat.name] || 0
            }))
            .sort((a, b) => (b.limit > 0 ? b.spent / b.limit : 0) - (a.limit > 0 ? a.spent / a.limit : 0));
    }, [categories, transactions, currentDateRange, recurringExpenses]);

    const handleUpdateLimit = async (catName: string, newLimit: number) => {
        if (!user) return;
        try {
            await setDoc(doc(db, 'users', user.uid, 'categories', catName), { budgetLimit: newLimit }, { merge: true });
        } catch (e) {
            console.error("Error updating limit", e);
        }
    };

    const handleToggleVisibility = async (catName: string, currentHidden?: boolean) => {
        if (!user) return;
        try {
            await setDoc(doc(db, 'users', user.uid, 'categories', catName), { isHidden: !currentHidden }, { merge: true });
        } catch (e) {
            console.error("Error toggling visibility", e);
        }
    };

    const handleAddGoal = async () => {
        if (!user || !newGoal.name || !newGoal.targetAmount) return;

        const id = generateId();
        const goalData: Goal = {
            ...newGoal,
            id,
            currentAmount: newGoal.currentAmount || 0,
            color: getRandomColor(),
            icon: 'Target',
            scope: scope
        } as Goal;

        try {
            await setDoc(doc(db, 'users', user.uid, 'goals', id), goalData);
            setIsAddingGoal(false);
            setNewGoal({});
        } catch (e) {
            console.error("Error adding goal", e);
            alert("Error al crear meta");
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!user) return;
        if (confirm("¿Eliminar esta meta?")) {
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'goals', id));
            } catch (e) {
                console.error("Error deleting goal", e);
            }
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <PiggyBank size={24} />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Presupuesto y Metas</h1>
                </div>
                <p className="text-slate-500">Define tus límites de gasto y construye tu patrimonio futuro.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* --- Goals Section --- */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Target size={18} className="text-indigo-600" /> Metas de Ahorro
                        </h3>
                        <button onClick={() => setIsAddingGoal(!isAddingGoal)} className="text-sm font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            {isAddingGoal ? "Cancelar" : "+ Nueva Meta"}
                        </button>
                    </div>
                    {isAddingGoal && (
                        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-4 mb-3">
                                <input placeholder="Nombre (ej. Boda)" className="px-3 py-2 border rounded-lg text-sm" value={newGoal.name || ""} onChange={e => setNewGoal({ ...newGoal, name: e.target.value })} />
                                <input type="number" placeholder="Objetivo ($)" className="px-3 py-2 border rounded-lg text-sm" value={newGoal.targetAmount || ""} onChange={e => setNewGoal({ ...newGoal, targetAmount: parseFloat(e.target.value) })} />
                                <input type="number" placeholder="Ahorro Actual ($)" className="px-3 py-2 border rounded-lg text-sm" value={newGoal.currentAmount || ""} onChange={e => setNewGoal({ ...newGoal, currentAmount: parseFloat(e.target.value) })} />
                                <input type="date" className="px-3 py-2 border rounded-lg text-sm" value={newGoal.deadline || ""} onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })} />
                            </div>
                            <button onClick={handleAddGoal} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">Crear Meta</button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-4">
                        {goals.map(goal => {
                            const progress = (goal.currentAmount / goal.targetAmount) * 100;
                            return (
                                <div key={goal.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                                    <div className={`absolute top-0 left-0 w-1 h-full ${goal.color.split(' ')[0]}`}></div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-slate-800">{goal.name}</h4>
                                            <p className="text-xs text-slate-500">Meta: {formatCurrency(goal.targetAmount)} • {new Date(goal.deadline).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-emerald-600">{formatCurrency(goal.currentAmount)}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">{progress.toFixed(0)}%</div>
                                        </div>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5 mb-3">
                                        <div className={`h-2.5 rounded-full transition-all duration-1000 ${goal.color.split(' ')[0].replace('bg-', 'bg-')}`} style={{ width: `${Math.min(progress, 100)}%` }}></div>
                                    </div>
                                    <button onClick={() => handleDeleteGoal(goal.id)} className="absolute top-2 right-2 p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* --- Budgets Section --- */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <PiggyBank size={18} className="text-emerald-600" /> Presupuesto
                        </h3>
                        <div className="flex gap-2">
                            {/* Month Status Protection */}
                            {isMonthClosed ? (
                                <span className="text-xs font-bold text-slate-400 px-3 py-1.5 bg-slate-100 rounded-lg flex items-center gap-1 border border-slate-200 cursor-not-allowed" title="El mes está cerrado, no se puede editar el presupuesto.">
                                    <AlertTriangle size={12} /> Lectura
                                </span>
                            ) : (
                                <button onClick={() => setIsEditingBudgets(!isEditingBudgets)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border ${isEditingBudgets ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                    {isEditingBudgets ? "Terminar Edición" : "Editar Presupuesto"}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="divide-y divide-slate-100">
                            {budgetData.map(cat => {
                                if (!isEditingBudgets && cat.isHidden) return null;

                                const percentage = cat.limit > 0 ? (cat.spent / cat.limit) * 100 : 0;
                                let barColor = "bg-emerald-500";
                                let textColor = "text-emerald-600";
                                if (percentage > 80) { barColor = "bg-amber-500"; textColor = "text-amber-600"; }
                                if (percentage > 100) { barColor = "bg-rose-500"; textColor = "text-rose-600"; }

                                // Validations
                                const isLimitTooLow = cat.limit > 0 && cat.limit < cat.minRequired;

                                return (
                                    <div key={cat.name} className={`p-4 hover:bg-slate-50 transition-colors ${isEditingBudgets ? 'bg-slate-50/50' : ''} ${cat.isHidden ? 'opacity-50 grayscale' : ''}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-3">
                                                {isEditingBudgets && (
                                                    <button
                                                        onClick={() => handleToggleVisibility(cat.name, cat.isHidden)}
                                                        className={`p-1.5 rounded-md transition-colors ${cat.isHidden ? 'text-slate-400 hover:bg-slate-200' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                                                        title={cat.isHidden ? "Mostrar en presupuesto" : "Ocultar del presupuesto"}
                                                    >
                                                        {cat.isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                )}
                                                <div className={`w-2 h-2 rounded-full ${cat.color.split(' ')[0].replace('bg-', 'bg-')}`}></div>
                                                <span className={`font-bold text-sm ${cat.isHidden ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`}>{cat.name}</span>
                                                {cat.minRequired > 0 && isEditingBudgets && (
                                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1" title="Gastos Fijos Recurrentes">
                                                        <Info size={10} /> Fijos: {formatCurrency(cat.minRequired)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right flex items-center gap-2">
                                                <span className={`font-mono font-bold text-sm ${cat.isHidden ? 'text-slate-400' : textColor}`}>{formatCurrency(cat.spent)}</span>
                                                <span className="text-xs text-slate-400">/</span>
                                                {isEditingBudgets ? (
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1.5 text-xs text-slate-400">$</span>
                                                        <input
                                                            type="number"
                                                            disabled={cat.isHidden}
                                                            className={`w-24 pl-4 pr-1 py-1 text-xs border focus:ring-2 rounded bg-white font-bold text-slate-700 disabled:opacity-50 disabled:bg-slate-100 ${isLimitTooLow ? 'border-rose-300 focus:ring-rose-500 text-rose-600' : 'border-indigo-300 focus:ring-indigo-500'}`}
                                                            value={cat.limit}
                                                            onChange={(e) => handleUpdateLimit(cat.name, parseFloat(e.target.value) || 0)}
                                                        />
                                                        {isLimitTooLow && (
                                                            <div className="absolute top-8 right-0 bg-rose-600 text-white text-[10px] px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap animate-in fade-in slide-in-from-top-1">
                                                                Mínimo sugerido: {formatCurrency(cat.minRequired)}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-medium text-slate-500">{formatCurrency(cat.limit)}</span>
                                                )}
                                            </div>
                                        </div>
                                        {!cat.isHidden && (
                                            <div className="w-full bg-slate-100 rounded-full h-2 relative">
                                                {/* Fixed Portion Indicator */}
                                                {cat.minRequired > 0 && cat.limit > 0 && (
                                                    <div
                                                        className="absolute top-0 left-0 h-2 bg-slate-300/50 z-0 border-r border-white"
                                                        style={{ width: `${Math.min((cat.minRequired / cat.limit) * 100, 100)}%` }}
                                                        title={`Porción Fija: ${formatCurrency(cat.minRequired)}`}
                                                    ></div>
                                                )}
                                                <div className={`h-2 rounded-full transition-all duration-500 relative z-10 ${barColor}`} style={{ width: `${Math.min(percentage, 100)}%` }}></div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="bg-slate-50 p-3 flex justify-between items-center border-t border-slate-200">
                            <p className="text-xs text-slate-500">Los presupuestos se reinician mensualmente.</p>
                            <button onClick={onNavigateToSettings} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                <Settings size={12} /> Gestionar Categorías
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
