import React, { useState, useMemo, useEffect } from 'react';
import { PiggyBank, Target, TrendingUp, AlertTriangle, Settings, Plus, Trash2, Eye, EyeOff, Info, Lock, CreditCard, History, Edit3 } from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { formatCurrency, getRandomColor, generateId } from '../../utils';
import { Goal, CategoryDef } from '../../types';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { closingService } from '../../services/ClosingService';
import { hybridBudgetService } from '../../services/HybridBudgetService';
import { calculateGoalQuota } from '../../utils/subscriptionHelpers';
import { EditHistoryModal } from './EditHistoryModal';
import { BudgetEditHistoryService } from '../../services/BudgetEditHistoryService';
import { BudgetItem } from '../../types/budgetEditHistory';

interface BudgetModuleProps {
    onNavigateToSettings: () => void;
}

export const BudgetModule = ({ onNavigateToSettings }: BudgetModuleProps) => {
    const { filterState } = useGlobalFilter();
    const { scope, timeframe } = filterState;
    const { user } = useAuth();

    // Data State
    const [budgetData, setBudgetData] = useState<any[]>([]);
    const [projectedIncome, setProjectedIncome] = useState(0);
    const [totalBudgeted, setTotalBudgeted] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // UI State for Details
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [detailView, setDetailView] = useState<{ category: string, type: 'fixed' | 'reserved' | 'variable' } | null>(null);

    const { data: allGoals } = useFirestore<Goal>('goals');
    const goals = (allGoals || []).filter(g => g.scope === scope || (scope === 'PERSONAL' && !g.scope));

    // UI State
    const [isAddingGoal, setIsAddingGoal] = useState(false);
    const [newGoal, setNewGoal] = useState<Partial<Goal>>({});

    const [isMonthClosed, setIsMonthClosed] = useState(false);
    const [isEditingBudgets, setIsEditingBudgets] = useState(false);

    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [editingCategory, setEditingCategory] = useState<{ category: string, items: BudgetItem[], total: number } | null>(null);

    // Fetch Hybrid Budget Data
    const fetchBudget = async () => {
        setIsLoading(true);
        const date = timeframe.start ? new Date(timeframe.start) : new Date();

        const [data, income] = await Promise.all([
            hybridBudgetService.getBudgetBreakdown(date, scope),
            hybridBudgetService.getProjectedIncome(date, scope)
        ]);

        setBudgetData(data);
        setProjectedIncome(income);
        setTotalBudgeted(data.reduce((sum, item) => sum + item.totalLimit, 0));

        setIsLoading(false);

        // Check Month Status
        const status = await closingService.getStatus(date, scope);
        setIsMonthClosed(status === 'CLOSED' || status === 'LOCKED');
    };

    useEffect(() => {
        fetchBudget();
    }, [scope, timeframe.mode, timeframe.start, timeframe.end]);

    const handleUpdateVariable = async (catName: string, amount: number) => {
        if (!user || isMonthClosed) return;
        const date = timeframe.start ? new Date(timeframe.start) : new Date();
        await hybridBudgetService.setVariableBudget(date, catName, scope, amount);

        // Optimistic Update
        setBudgetData(prev => {
            const newData = prev.map(item => {
                if (item.category === catName) {
                    return {
                        ...item,
                        variable: amount,
                        totalLimit: item.fixed + item.reserved + amount
                    };
                }
                return item;
            });
            setTotalBudgeted(newData.reduce((sum, item) => sum + item.totalLimit, 0));
            return newData;
        });
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
            fetchBudget(); // Refresh budget injection
        } catch (e) {
            console.error("Error adding goal", e);
            alert("Error al crear meta");
        }
    };

    const handleUpdateGoal = async () => {
        if (!user || !editingGoal || !editingGoal.name) return;

        try {
            await setDoc(doc(db, 'users', user.uid, 'goals', editingGoal.id), editingGoal);
            setEditingGoal(null);
            fetchBudget(); // Refresh budget injection
        } catch (e) {
            console.error("Error updating goal", e);
            alert("Error al actualizar meta");
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!user) return;
        if (confirm("¿Eliminar esta meta?")) {
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'goals', id));
                fetchBudget(); // Refresh budget injection
            } catch (e) {
                console.error("Error deleting goal", e);
            }
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <PiggyBank size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Presupuesto y Metas</h1>
                        <p className="text-slate-500 text-sm">Define tus límites de gasto (Fijos + Reservas + Variables) y construye patrimonio.</p>
                    </div>
                </div>

                {/* Zero-Based Summary Card */}
                {!isLoading && (
                    <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex-1 w-full text-center md:text-left">
                            <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Ingresos Proyectados</span>
                            <div className="text-2xl font-mono font-bold text-emerald-400">{formatCurrency(projectedIncome)}</div>
                        </div>

                        <div className="hidden md:block h-10 w-px bg-slate-700"></div>

                        <div className="flex-1 w-full text-center md:text-left">
                            <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Total Asignado</span>
                            <div className="text-2xl font-mono font-bold text-white">{formatCurrency(totalBudgeted)}</div>
                        </div>

                        <div className="hidden md:block h-10 w-px bg-slate-700"></div>

                        <div className="flex-1 w-full text-center md:text-left">
                            <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Por Asignar</span>
                            <div className={`text - 2xl font - mono font - bold ${projectedIncome - totalBudgeted < 0 ? 'text-rose-400' : 'text-indigo-400'} `}>
                                {formatCurrency(projectedIncome - totalBudgeted)}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* --- Goals Section (Unchanged) --- */}
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
                            <h4 className="text-xs font-bold text-indigo-600 uppercase mb-3 px-1">Nueva Meta</h4>
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Nombre</label>
                                        <input placeholder="Ej. Fondo de Emergencia" className="px-3 py-2 border rounded-lg text-sm w-full" value={newGoal.name || ""} onChange={e => setNewGoal({ ...newGoal, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Objetivo ($)</label>
                                        <input type="number" placeholder="5000" className="px-3 py-2 border rounded-lg text-sm w-full" value={newGoal.targetAmount || ""} onChange={e => setNewGoal({ ...newGoal, targetAmount: parseFloat(e.target.value) })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Ahorro Actual ($)</label>
                                        <input type="number" placeholder="0" className="px-3 py-2 border rounded-lg text-sm w-full" value={newGoal.currentAmount || ""} onChange={e => setNewGoal({ ...newGoal, currentAmount: parseFloat(e.target.value) })} />
                                    </div>
                                </div>

                                <div className="border-t pt-3">
                                    <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                                        📅 Período de Ahorro
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Fecha Inicio</label>
                                            <input type="date" className="px-3 py-2 border border-emerald-200 rounded-lg text-sm w-full" value={newGoal.startDate || ""} onChange={e => setNewGoal({ ...newGoal, startDate: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-rose-600 uppercase mb-1 block">Fecha Objetivo</label>
                                            <input type="date" className="px-3 py-2 border border-rose-200 rounded-lg text-sm w-full" value={newGoal.targetDate || newGoal.deadline || ""} onChange={e => setNewGoal({ ...newGoal, targetDate: e.target.value, deadline: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-indigo-600 uppercase mb-1 block">Cuota Mensual (Opcional)</label>
                                    <input
                                        type="number"
                                        placeholder={(() => {
                                            const autoQuota = calculateGoalQuota({ ...newGoal, monthlyQuota: undefined });
                                            return autoQuota > 0 ? `Sugerencia automática: $${autoQuota.toFixed(2)}/mes` : 'Dejar vacío para usar sugerencia';
                                        })()}
                                        className="px-3 py-2 border border-indigo-200 rounded-lg text-sm w-full"
                                        value={newGoal.monthlyQuota || ""}
                                        onChange={e => setNewGoal({ ...newGoal, monthlyQuota: parseFloat(e.target.value) })}
                                    />
                                </div >
                            </div >
                            <button onClick={handleAddGoal} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">Crear Meta</button>
                        </div >
                    )}

                    {
                        editingGoal && (
                            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm animate-in slide-in-from-top-2">
                                <h4 className="text-xs font-bold text-amber-600 uppercase mb-3 px-1">Editar Meta</h4>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Nombre</label>
                                            <input className="px-3 py-2 border rounded-lg text-sm w-full" value={editingGoal.name || ""} onChange={e => setEditingGoal({ ...editingGoal, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Objetivo ($)</label>
                                            <input type="number" className="px-3 py-2 border rounded-lg text-sm w-full" value={editingGoal.targetAmount || ""} onChange={e => setEditingGoal({ ...editingGoal, targetAmount: parseFloat(e.target.value) })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Ahorro Actual ($)</label>
                                            <input type="number" className="px-3 py-2 border rounded-lg text-sm w-full" value={editingGoal.currentAmount || ""} onChange={e => setEditingGoal({ ...editingGoal, currentAmount: parseFloat(e.target.value) })} />
                                        </div>
                                    </div>

                                    <div className="border-t pt-3">
                                        <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                                            📅 Período de Ahorro
                                        </h5>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Fecha Inicio</label>
                                                <input type="date" className="px-3 py-2 border border-emerald-200 rounded-lg text-sm w-full" value={editingGoal.startDate || ""} onChange={e => setEditingGoal({ ...editingGoal, startDate: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-rose-600 uppercase mb-1 block">Fecha Objetivo</label>
                                                <input type="date" className="px-3 py-2 border border-rose-200 rounded-lg text-sm w-full" value={editingGoal.targetDate || editingGoal.deadline || ""} onChange={e => setEditingGoal({ ...editingGoal, targetDate: e.target.value, deadline: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-indigo-600 uppercase mb-1 block">Cuota Mensual (Opcional)</label>
                                        <input
                                            type="number"
                                            placeholder={(() => {
                                                const autoQuota = calculateGoalQuota({ ...editingGoal, monthlyQuota: undefined });
                                                return autoQuota > 0 ? `Sugerencia automática: $${autoQuota.toFixed(2)}/mes` : 'Dejar vacío para usar sugerencia';
                                            })()}
                                            className="px-3 py-2 border border-indigo-200 rounded-lg text-sm w-full"
                                            value={editingGoal.monthlyQuota || ""}
                                            onChange={e => setEditingGoal({ ...editingGoal, monthlyQuota: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setEditingGoal(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Cancelar</button>
                                    <button onClick={handleUpdateGoal} className="flex-1 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm">Guardar Cambios</button>
                                </div>
                            </div>
                        )
                    }

                    <div className="grid grid-cols-1 gap-4">
                        {goals.map(goal => {
                            const progress = (goal.currentAmount / goal.targetAmount) * 100;
                            const monthlyQuota = calculateGoalQuota(goal);

                            return (
                                <div key={goal.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                                    <div className={`absolute top-0 left-0 w-1.5 h-full ${goal.color.split(' ')[0]}`}></div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                {goal.name}
                                                {goal.monthlyQuota && (
                                                    <span title="Cuota Fija Manual">
                                                        <Lock size={12} className="text-slate-400" />
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-[10px] text-slate-500 font-medium">
                                                Meta: {formatCurrency(goal.targetAmount)} • {goal.targetDate || goal.deadline ? new Date((goal.targetDate || goal.deadline) + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) : 'Sin fecha'}
                                                {goal.startDate && (
                                                    <span className="text-[9px] text-slate-400 ml-1">
                                                        (Inicio: {new Date(goal.startDate + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })})
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-emerald-600">{formatCurrency(goal.currentAmount)}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">{progress.toFixed(0)}%</div>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Acumulado</span>
                                            {monthlyQuota > 0 && (
                                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-100">
                                                    Ahorro sugerido: {formatCurrency(monthlyQuota)}/mes
                                                </span>
                                            )}
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2.5 relative">
                                            <div className={`h-2.5 rounded-full transition-all duration-1000 ${goal.color.split(' ')[0].replace('bg-', 'bg-')}`} style={{ width: `${Math.min(progress, 100)}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditingGoal(goal)} className="p-2 text-slate-400 hover:text-amber-500 transition-colors">
                                            <Settings size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteGoal(goal.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div >

                {/* --- Hybrid Budgets Section --- */}
                < div className="space-y-6" >
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <PiggyBank size={18} className="text-emerald-600" /> Presupesto Híbrido
                        </h3>
                        <div className="flex gap-2">

                            <button
                                onClick={() => setShowHistory(true)}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
                            >
                                <History size={14} />
                                Historial
                            </button>



                            {isMonthClosed ? (
                                <span className="text-xs font-bold text-slate-400 px-3 py-1.5 bg-slate-100 rounded-lg flex items-center gap-1 border border-slate-200 cursor-not-allowed">
                                    <AlertTriangle size={12} /> Mes Cerrado - Lectura
                                </span>
                            ) : (
                                <button onClick={() => setIsEditingBudgets(!isEditingBudgets)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border ${isEditingBudgets ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                    {isEditingBudgets ? "Terminar Edición" : "Editar Presupuesto"}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {isLoading ? (
                            <div className="p-8 text-center text-slate-500">Cargando presupuesto...</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {budgetData.map(cat => {
                                    const totalLimit = cat.totalLimit;
                                    const percentage = totalLimit > 0 ? (cat.spent / totalLimit) * 100 : 0;

                                    // Segment Percentages for Bar
                                    const pFixed = totalLimit > 0 ? (cat.fixed / totalLimit) * 100 : 0;
                                    const pReserve = totalLimit > 0 ? (cat.reserved / totalLimit) * 100 : 0;
                                    const pVariable = totalLimit > 0 ? (cat.variable / totalLimit) * 100 : 0;

                                    const isExpanded = expandedCategory === cat.category;

                                    return (
                                        <div key={cat.category} className="hover:bg-slate-50 transition-colors">
                                            {/* Main Row */}
                                            <div
                                                className="p-4 cursor-pointer"
                                                onClick={() => setExpandedCategory(isExpanded ? null : cat.category)}
                                            >
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {cat.category === "Metas de Patrimonio" && <TrendingUp size={16} className="text-indigo-600" />}
                                                        <span className={`font-bold ${cat.category === "Metas de Patrimonio" ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                            {cat.category}
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`font-mono font-bold text-sm ${cat.spent > cat.totalLimit ? 'text-rose-600' : (cat.category === "Metas de Patrimonio" ? 'text-indigo-600' : 'text-slate-700')}`}>
                                                            {formatCurrency(cat.spent)}
                                                        </span>
                                                        <span className="text-xs text-slate-400 mx-1">/</span>
                                                        <span className="text-xs font-medium text-slate-500">{formatCurrency(cat.totalLimit)}</span>
                                                    </div>
                                                </div>

                                                {/* Stacked Progress Bar */}
                                                <div className="w-full bg-slate-100 rounded-full h-3 relative flex overflow-hidden">
                                                    {/* Fixed - Dark Blue */}
                                                    <div className="bg-slate-700 h-full" style={{ width: `${pFixed}%` }} title={`Fijo: ${formatCurrency(cat.fixed)}`}></div>
                                                    {/* Reserved - Purple */}
                                                    <div className="bg-violet-500 h-full" style={{ width: `${pReserve}%` }} title={`Reserva: ${formatCurrency(cat.reserved)}`}></div>
                                                    {/* Variable - Green */}
                                                    <div className="bg-emerald-500 h-full" style={{ width: `${pVariable}%` }} title={`Variable: ${formatCurrency(cat.variable)}`}></div>

                                                    {/* Savings specialized bar color */}
                                                    {cat.category === "Metas de Patrimonio" && (
                                                        <div className="absolute inset-0 bg-indigo-500/10 animate-pulse pointer-events-none"></div>
                                                    )}

                                                    {/* Spending Marker Line */}
                                                    <div
                                                        className="absolute top-0 bottom-0 w-0.5 bg-black z-10 shadow-[0_0_4px_rgba(0,0,0,0.5)]"
                                                        style={{ left: `${Math.min(percentage, 100)}%` }}
                                                        title={`Gastado: ${formatCurrency(cat.spent)}`}
                                                    ></div>
                                                </div>
                                            </div>

                                            {/* Expanded Edit Panel */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 bg-slate-50/50 animate-in slide-in-from-top-1">

                                                    {/* For "Metas de Patrimonio", show goal list directly */}
                                                    {cat.category === "Metas de Patrimonio" ? (
                                                        <div className="bg-white rounded-xl border border-indigo-200 p-3 shadow-inner">
                                                            <h5 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-3 border-b border-indigo-100 pb-1 flex items-center gap-1">
                                                                <Target size={12} /> Metas de Ahorro Activas
                                                            </h5>
                                                            <div className="space-y-2">
                                                                {cat.details?.reserved?.length === 0 ? (
                                                                    <p className="text-xs text-slate-400 italic text-center py-2">No hay metas activas este mes.</p>
                                                                ) : (
                                                                    cat.details?.reserved?.map((item: any) => (
                                                                        <div key={item.id} className="flex justify-between items-center text-xs p-2 bg-indigo-50/50 hover:bg-indigo-100/50 rounded-lg group transition-colors border border-indigo-100">
                                                                            <span className="font-medium text-slate-700">{item.name}</span>
                                                                            <div className="text-right">
                                                                                <div className="font-mono font-bold text-indigo-700">{formatCurrency(item.amount)}</div>
                                                                                {item.notice && <div className="text-[10px] text-indigo-500 font-medium">{item.notice}</div>}
                                                                            </div>
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : cat.category === "Servicio de Deuda" ? (
                                                        /* For "Servicio de Deuda", show debt list directly */
                                                        <div className="bg-white rounded-xl border border-rose-200 p-3 shadow-inner">
                                                            <h5 className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-3 border-b border-rose-100 pb-1 flex items-center gap-1">
                                                                <CreditCard size={12} /> Deudas del Mes
                                                            </h5>
                                                            <div className="space-y-2">
                                                                {/* Combine all debt items from fixed and reserved */}
                                                                {(() => {
                                                                    const allDebtItems = [
                                                                        ...(cat.details?.fixed || []),
                                                                        ...(cat.details?.reserved || [])
                                                                    ];

                                                                    return allDebtItems.length === 0 ? (
                                                                        <p className="text-xs text-slate-400 italic text-center py-2">No hay pagos de deuda este mes.</p>
                                                                    ) : (
                                                                        allDebtItems.map((item: any) => (
                                                                            <div key={item.id} className="flex justify-between items-center text-xs p-2 bg-rose-50/50 hover:bg-rose-100/50 rounded-lg group transition-colors border border-rose-100">
                                                                                <span className="font-medium text-slate-700">{item.name}</span>
                                                                                <div className="text-right">
                                                                                    <div className="font-mono font-bold text-rose-700">{formatCurrency(item.amount)}</div>
                                                                                    {item.notice && <div className="text-[10px] text-rose-500 font-medium">{item.notice}</div>}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Summary Boxes (Clickable) - Only for regular categories */}
                                                            <div className="flex gap-4 text-xs mb-3">
                                                                {/* Recurrente Box */}
                                                                <div
                                                                    onClick={(e) => { e.stopPropagation(); setDetailView(detailView?.type === 'fixed' && detailView?.category === cat.category ? null : { category: cat.category, type: 'fixed' }); }}
                                                                    className={`flex-1 p-2 rounded border cursor-pointer transition-all ${detailView?.type === 'fixed' && detailView?.category === cat.category ? 'ring-2 ring-slate-400 bg-slate-200' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                                                                >
                                                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1 flex items-center gap-1">
                                                                        <Lock size={10} /> Recurrente {cat.details?.fixed?.length > 0 && `(${cat.details.fixed.length})`}
                                                                    </label>
                                                                    <div className="font-mono font-bold text-slate-600">{formatCurrency(cat.fixed)}</div>
                                                                </div>

                                                                {/* Smart Reserve Box */}
                                                                <div
                                                                    onClick={(e) => { e.stopPropagation(); setDetailView(detailView?.type === 'reserved' && detailView?.category === cat.category ? null : { category: cat.category, type: 'reserved' }); }}
                                                                    className={`flex-1 p-2 rounded border cursor-pointer transition-all ${detailView?.type === 'reserved' && detailView?.category === cat.category ? 'ring-2 ring-violet-400 bg-violet-100' : 'bg-violet-50 border-violet-100 hover:bg-violet-100'}`}
                                                                >
                                                                    <label className="block text-[10px] uppercase text-violet-500 font-bold mb-1 flex items-center gap-1">
                                                                        <Lock size={10} /> Smart Reserve {cat.details?.reserved?.length > 0 && `(${cat.details.reserved.length})`}
                                                                    </label>
                                                                    <div className="font-mono font-bold text-violet-700">{formatCurrency(cat.reserved)}</div>
                                                                    {cat.reservationNotice && <div className="text-[9px] text-violet-500 font-medium mt-1">{cat.reservationNotice}</div>}
                                                                </div>

                                                                {/* Editable Variable Field (Clickable for details too) */}
                                                                <div className="flex-1 p-2 bg-white rounded border border-emerald-200 shadow-sm ring-2 ring-emerald-50">
                                                                    <div
                                                                        className="cursor-pointer"
                                                                        onClick={(e) => { e.stopPropagation(); setDetailView(detailView?.type === 'variable' && detailView?.category === cat.category ? null : { category: cat.category, type: 'variable' }); }}
                                                                    >
                                                                        <label className="block text-[10px] uppercase text-emerald-600 font-bold mb-1">
                                                                            Variable Manual {cat.details?.variable?.length > 0 && `(${cat.details.variable.length})`}
                                                                        </label>
                                                                    </div>
                                                                    {isMonthClosed ? (
                                                                        <div className="font-mono font-bold text-slate-400">{formatCurrency(cat.variable)}</div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-slate-400">$</span>
                                                                            <input
                                                                                type="number"
                                                                                className="w-full bg-transparent font-bold text-slate-800 outline-none"
                                                                                value={cat.variable}
                                                                                onChange={(e) => handleUpdateVariable(cat.category, parseFloat(e.target.value) || 0)}
                                                                                onClick={(e) => e.stopPropagation()} // Stop propagation to avoid toggling details when typing
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Detail List View - Only for regular categories */}
                                                            {detailView?.category === cat.category && cat.details && (
                                                                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-inner animate-in slide-in-from-top-2 mx-1 mb-2">
                                                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                                                                        Detalle: {detailView.type === 'fixed' ? 'Gastos Recurrentes' : detailView.type === 'reserved' ? 'Reservas Inteligentes' : 'Presupuesto Variable'}
                                                                    </h5>
                                                                    <div className="space-y-1">
                                                                        {cat.details[detailView.type]?.length === 0 ? (
                                                                            <p className="text-xs text-slate-400 italic text-center py-2">No hay items en esta sección.</p>
                                                                        ) : (
                                                                            cat.details[detailView.type]?.map((item: any) => (
                                                                                <div key={item.id} className="flex justify-between items-center text-xs p-2 hover:bg-slate-50 rounded-lg group transition-colors">
                                                                                    <span className="font-medium text-slate-700">{item.name}</span>
                                                                                    <div className="text-right">
                                                                                        <div className="font-mono font-bold text-slate-800">{formatCurrency(item.amount)}</div>
                                                                                        {item.notice && <div className="text-[10px] text-amber-600 font-medium">{item.notice}</div>}
                                                                                    </div>
                                                                                </div>
                                                                            ))
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="bg-slate-50 p-3 flex justify-between items-center border-t border-slate-200">
                            <p className="text-xs text-slate-500">
                                <span className="inline-block w-2 h-2 rounded-full bg-slate-700 mr-1"></span>Fijo
                                <span className="inline-block w-2 h-2 rounded-full bg-violet-500 mx-1"></span>Reserva
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mx-1"></span>Variable
                            </p>
                            <button onClick={onNavigateToSettings} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                <Settings size={12} /> Gestionar Categorías
                            </button>
                        </div>
                    </div>
                </div >
            </div>
            {/* Edit History Modal */}
            {showHistory && user && (
                <EditHistoryModal
                    userId={user.uid}
                    scope={scope.toUpperCase() as any}
                    month={timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
};


