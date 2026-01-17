import React, { useState, useMemo, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, AlertTriangle, Settings, History, PiggyBank, Briefcase, Lock, Wallet, RotateCcw, Coins, Building2, Trash2, PieChart, Target, TrendingUp, CreditCard } from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { formatCurrency, getRandomColor, generateId } from '../../utils';
import { Goal, CategoryDef } from '../../types';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { closingService } from '../../services/ClosingService';
import { hybridBudgetService } from '../../services/HybridBudgetService';
import { calculateGoalQuota } from '../../utils/subscriptionHelpers';
import { EditHistoryModal } from './EditHistoryModal';
import { BudgetReviewModal } from './BudgetReviewModal';
import { BudgetEditHistoryService } from '../../services/BudgetEditHistoryService';
import { BudgetItem } from '../../types/budgetEditHistory';
import { InlineItemEditor } from './InlineItemEditor';
import { BudgetCategoryRow } from './BudgetCategoryRow';

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
    const [showReview, setShowReview] = useState(false);
    const [editingCategory, setEditingCategory] = useState<{ category: string, budgetType: 'fixed' | 'reserved' | 'variable' } | null>(null);

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

    // Handler: Save edited items with history tracking
    const handleSaveItemsWithTracking = async (
        category: string,
        budgetType: 'fixed' | 'reserved' | 'variable',
        newItems: BudgetItem[],
        editReason?: string
    ) => {
        if (!user || !timeframe.start) return;

        try {
            // 1. Get current items for comparison
            const currentCategory = budgetData.find(c => c.category === category);
            // Safe access using any to bypass strict type check on the complex hybrid object for now
            const currentItems = ((currentCategory?.details as any)?.[budgetType]) || [];

            // Calculate totals
            const previousTotal = currentItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

            // Fix: Handle empty list explicitly
            const safeNewItems = newItems && newItems.length > 0 ? newItems : [];
            const newTotal = safeNewItems.reduce((sum, item) => sum + (item.amount || 0), 0);

            // 2. Update in Firebase (monthly_budgets)
            const monthKey = `${scope}_${timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)} `;
            const budgetDocRef = doc(db, 'users', user.uid, 'monthly_budgets', monthKey);

            const currentDoc = await getDoc(budgetDocRef);
            const currentData = currentDoc.data() || {};
            const categories = currentData.categories || {};

            if (!categories[category]) {
                categories[category] = { fixed: 0, reserved: 0, variable: 0, details: {} };
            }
            categories[category].details = categories[category].details || {};
            categories[category].details[budgetType] = safeNewItems;
            categories[category][budgetType] = newTotal;

            console.log('Saving budget items:', { category, budgetType, items: safeNewItems, total: newTotal });

            await setDoc(budgetDocRef, { ...currentData, categories }, { merge: true });

            // 3. Track in history
            await BudgetEditHistoryService.saveEdit(
                user.uid,
                scope as any,
                timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7),
                category,
                budgetType,
                previousTotal,
                currentItems.filter((i: any) => i).map((item: any) => ({
                    id: item.id || '',
                    name: item.name || '',
                    amount: item.amount || 0
                })),
                newTotal,
                safeNewItems,
                editReason
            );

            // 4. Refresh budget data
            await fetchBudget();

            // 5. Close editor
            setEditingCategory(null);
        } catch (error) {
            console.error('Error saving items:', error);
            alert('Error al guardar cambios');
        }
    };

    // TEMPORARY DEBUG: Clear history
    const handleClearHistory = async () => {
        if (!confirm('¿Borrar todo el historial de este mes? Esto no se puede deshacer.')) return;
        try {
            const h = await BudgetEditHistoryService.getHistory(user!.uid, scope as any, timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7));
            const { deleteDoc, doc } = await import('firebase/firestore');
            const { db } = await import('../../firebase/config');

            await Promise.all(h.map(entry => deleteDoc(doc(db, 'users', user!.uid, 'budget_edit_history', entry.id))));
            alert('Historial borrado.');
        } catch (e) {
            console.error(e);
            alert('Error al borrar');
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
                            <div className={`text-2xl font-mono font-bold ${projectedIncome - totalBudgeted < 0 ? 'text-rose-400' : 'text-indigo-400'}`}>
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

                            <button
                                onClick={() => setShowReview(true)}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200"
                            >
                                <PieChart size={14} />
                                Revisión
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
                                {budgetData.map(cat => (
                                    <BudgetCategoryRow
                                        key={cat.category}
                                        category={cat}
                                        isExpanded={expandedCategory === cat.category}
                                        isMonthClosed={isMonthClosed}
                                        detailView={detailView}
                                        editingCategory={editingCategory}
                                        onToggleExpand={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                                        onSetDetailView={(view) => setDetailView(view)}
                                        onUpdateVariable={(value) => handleUpdateVariable(cat.category, value)}
                                        onStartEdit={(budgetType) => setEditingCategory({ category: cat.category, budgetType })}
                                        onSaveItems={(items, reason) => handleSaveItemsWithTracking(cat.category, editingCategory?.budgetType || 'variable', items, reason)}
                                        onCancelEdit={() => setEditingCategory(null)}
                                    />
                                ))}
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
            </div >
            {/* Edit History Modal */}
            {
                showHistory && user && (
                    <EditHistoryModal
                        userId={user.uid}
                        scope={scope.toUpperCase() as any}
                        month={timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)}
                        onClose={() => setShowHistory(false)}
                    />
                )
            }

            {/* Comparison Review Modal */}
            {
                showReview && user && (
                    <BudgetReviewModal
                        isOpen={showReview}
                        onClose={() => setShowReview(false)}
                        userId={user.uid}
                        scope={scope.toUpperCase() as any}
                        currentMonth={timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)}
                    />
                )
            }
        </div>
    );
};
