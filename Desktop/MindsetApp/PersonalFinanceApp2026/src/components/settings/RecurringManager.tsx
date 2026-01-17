import React, { useState } from 'react';
// import { useLiveQuery } from 'dexie-react-hooks'; // Removed
// import { db } from '../../db/db'; // Removed
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { IncomeSource, RecurringExpense, RecurringFrequency, CategoryDef, Account } from '../../types';
import { generateId, formatCurrency } from '../../utils';
import { Calendar, DollarSign, Plus, Trash2, CheckCircle, Repeat, ArrowRight, AlertTriangle, Search, Filter, StickyNote, FileText, Table as TableIcon, CreditCard, X, Edit2 } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';
import { calculateSmartReserve, daysBetween, getUrgencyBadge, getFrequencyLabel, calculateSmartReserveForExpense } from '../../utils/subscriptionHelpers';

export const RecurringManager = () => {
    const { scope } = useScope();
    const { user } = useAuth();

    // Cloud Data Fetching
    const { data: allIncomes } = useFirestore<IncomeSource>('incomeSources');
    const incomes = (allIncomes || []).filter(i => i.scope === scope || (scope === 'PERSONAL' && !i.scope));

    const { data: allExpenses } = useFirestore<RecurringExpense>('recurringExpenses');
    const expenses = (allExpenses || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

    const { data: allCategories } = useFirestore<CategoryDef>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    const { data: allAccounts } = useFirestore<Account>('accounts');
    const accounts = (allAccounts || []).filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope));

    // Sort expenses by urgency
    const sortedExpenses = [...expenses].sort((a, b) => {
        const today = new Date().toISOString().split('T')[0];
        const daysA = daysBetween(today, a.nextDueDate || '');
        const daysB = daysBetween(today, b.nextDueDate || '');
        return daysA - daysB;
    });

    // View State
    const [viewMode, setViewMode] = useState<'CARD' | 'TABLE'>('TABLE');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('ALL');

    const [newIncome, setNewIncome] = useState<Partial<IncomeSource>>({ frequency: 'MONTHLY' });
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newExpense, setNewExpense] = useState<Partial<RecurringExpense>>({
        active: true,
        autoPay: false,
        frequency: 'MONTHLY' as RecurringFrequency,
        startDate: new Date().toISOString().split('T')[0],
        nextDueDate: '',
        notes: '',
        reservation: { isEnabled: false, startDate: new Date().toISOString().split('T')[0] }
    });

    // --- Validation Logic ---
    const getBudgetConflict = (amount: number, categoryName: string) => {
        const category = categories.find(c => c.name === categoryName);
        if (!category) return null;

        // Existing expenses in this category
        const existingExpenses = expenses
            .filter(e => e.category === categoryName && e.active && e.id !== editingId)
            .reduce((sum, e) => sum + e.amount, 0);

        const newTotal = existingExpenses + amount;
        const limit = category.budgetLimit || 0;

        if (newTotal > limit) {
            return { limit, newTotal, diff: newTotal - limit };
        }
        return null;
    };

    const conflict = newExpense.amount && newExpense.category
        ? getBudgetConflict(parseFloat(newExpense.amount.toString()), newExpense.category)
        : null;


    // --- Income Handlers ---
    const addIncome = async () => {
        if (!user || !newIncome.name || !newIncome.amount || !newIncome.payDay1) return;

        const id = generateId();

        // Sanitize numbers
        const amount = parseFloat(newIncome.amount.toString()) || 0;
        const p1 = parseInt(newIncome.payDay1.toString()) || 1;

        let p2: number | undefined = undefined;
        if (newIncome.frequency === 'BIWEEKLY') {
            p2 = newIncome.payDay2 ? parseInt(newIncome.payDay2.toString()) : p1 + 15;
            if (isNaN(p2)) p2 = p1 + 15; // Fallback
        }

        const incomeData: any = { // Use any to allow dynamic field construction for Firestore
            ...newIncome,
            id,
            amount,
            payDay1: p1,
            scope: scope
        };

        // Only add payDay2 if it exists
        if (p2 !== undefined) {
            incomeData.payDay2 = p2;
        }

        try {
            await setDoc(doc(db, 'users', user.uid, 'incomeSources', id), incomeData);
            setNewIncome({ frequency: 'MONTHLY' });
        } catch (e) {
            console.error("Error adding income", e);
            alert("Error al guardar ingreso: " + (e as Error).message);
        }
    };

    const deleteIncome = async (id: string) => {
        if (!user) return;
        if (window.confirm("¿Eliminar este ingreso?")) {
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'incomeSources', id));
            } catch (e) {
                console.error("Error deleting income", e);
            }
        }
    }

    // --- Expense Handlers ---
    const handleEdit = (expense: RecurringExpense) => {
        setEditingId(expense.id);
        setNewExpense({
            ...expense,
            nextDueDate: expense.nextDueDate || '',
            startDate: expense.startDate || new Date().toISOString().split('T')[0],
            endDate: expense.endDate,
            notes: expense.notes || '',
            reservation: expense.reservation || { isEnabled: false, startDate: new Date().toISOString().split('T')[0] }
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setNewExpense({
            active: true,
            autoPay: false,
            frequency: 'MONTHLY',
            startDate: new Date().toISOString().split('T')[0],
            nextDueDate: '',
            notes: '',
            reservation: { isEnabled: false, startDate: new Date().toISOString().split('T')[0] }
        });
    };

    const saveExpense = async () => {
        if (!user || !newExpense.name || !newExpense.amount || !newExpense.nextDueDate || !newExpense.category) return;
        const amount = parseFloat(newExpense.amount.toString());

        // Validate Budget Update
        if (conflict) {
            const shouldUpdate = confirm(`⚠️ Este gasto excede tu presupuesto de ${newExpense.category} por ${formatCurrency(conflict.diff)}.\n\n¿Deseas aumentar el presupuesto automáticamente a ${formatCurrency(conflict.newTotal)}?`);
            if (shouldUpdate) {
                try {
                    // Update category limit in Firestore
                    // Assuming category ID matches name or we search for it.
                    // In CategoryManager we used name as ID. Let's assume consistent strategy.
                    await setDoc(doc(db, 'users', user.uid, 'categories', newExpense.category), { budgetLimit: conflict.newTotal }, { merge: true });
                } catch (e) {
                    console.error("Error updating category budget", e);
                }
            }
        }

        // Extract day from nextDueDate for backward compatibility
        const nextDue = new Date(newExpense.nextDueDate);
        const dueDay = nextDue.getDate();

        // Create clean object avoiding undefined values
        const expenseData: any = {
            id: editingId || generateId(),
            name: newExpense.name,
            amount: amount,
            category: newExpense.category,
            active: newExpense.active ?? true,
            autoPay: newExpense.autoPay ?? false,
            frequency: newExpense.frequency || 'MONTHLY',
            startDate: newExpense.startDate || new Date().toISOString().split('T')[0],
            nextDueDate: newExpense.nextDueDate,
            scope: scope,
            account_id: newExpense.account_id,
            notes: newExpense.notes || '',
            dueDay: dueDay // Legacy support
        };

        if (newExpense.endDate) {
            expenseData.endDate = newExpense.endDate;
        }

        // Handle reservation safely
        if (newExpense.reservation) {
            // Only include reservation if it has meaningful data or is enabled
            // Sanitize undefineds inside reservation
            const safeRes = {
                isEnabled: newExpense.reservation.isEnabled ?? false,
                startDate: newExpense.reservation.startDate,
                initialSaved: newExpense.reservation.initialSaved ?? 0 // Default to 0 if undefined
            };
            // Only add if explicit
            expenseData.reservation = safeRes;
        }

        try {
            if (editingId) {
                await setDoc(doc(db, 'users', user.uid, 'recurringExpenses', editingId), expenseData);
            } else {
                await setDoc(doc(db, 'users', user.uid, 'recurringExpenses', expenseData.id), expenseData);
            }
            cancelEdit();
        } catch (e) {
            console.error("Error saving expense", e);
            alert("Error al guardar gasto recurrente");
        }
    };

    const deleteExpense = async (id: string) => {
        if (!user) return;
        if (window.confirm("¿Eliminar este gasto recurrente?")) {
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'recurringExpenses', id));
            } catch (e) {
                console.error("Error deleting expense", e);
            }
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            {/* --- INCOME SECTION --- */}
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <DollarSign size={20} className="text-emerald-600" /> Fuentes de Ingreso
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">Registra tus salarios o ingresos fijos para proyectar tu liquidez.</p>

                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                        <input
                            placeholder="Nombre (Ej. Nómina)"
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            value={newIncome.name || ''}
                            onChange={e => setNewIncome({ ...newIncome, name: e.target.value })}
                        />
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Monto Est."
                                className="w-1/2 px-3 py-2 border rounded-lg text-sm"
                                value={newIncome.amount || ''}
                                onChange={e => setNewIncome({ ...newIncome, amount: parseFloat(e.target.value) })}
                            />
                            <select
                                className="w-1/2 px-3 py-2 border rounded-lg text-sm"
                                value={newIncome.frequency}
                                onChange={e => setNewIncome({ ...newIncome, frequency: e.target.value as any })}
                            >
                                <option value="MONTHLY">Mensual</option>
                                <option value="BIWEEKLY">Quincenal</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">Cuenta de Destino</label>
                            <select
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                                value={newIncome.account_id || ''}
                                onChange={e => setNewIncome({ ...newIncome, account_id: e.target.value })}
                            >
                                <option value="">Seleccionar Cuenta (Opcional)</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.institution})</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 items-center">
                            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Día de pago:</span>
                            <input
                                type="number" placeholder="Día" min="1" max="31"
                                className="w-16 px-2 py-1 border rounded text-sm text-center"
                                value={newIncome.payDay1 || ''}
                                onChange={e => setNewIncome({ ...newIncome, payDay1: parseInt(e.target.value) })}
                            />
                            {newIncome.frequency === 'BIWEEKLY' && (
                                <>
                                    <span className="text-xs text-slate-400">y</span>
                                    <input
                                        type="number" placeholder="Día 2" min="1" max="31"
                                        className="w-16 px-2 py-1 border rounded text-sm text-center"
                                        value={newIncome.payDay2 || ''}
                                        onChange={e => setNewIncome({ ...newIncome, payDay2: parseInt(e.target.value) })}
                                    />
                                </>
                            )}
                        </div>
                        <button onClick={addIncome} className="w-full py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700">
                            Agregar Ingreso
                        </button>
                    </div>

                    <div className="space-y-3">
                        {incomes.map(inc => (
                            <div key={inc.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-slate-50">
                                <div>
                                    <div className="font-bold text-slate-800">{inc.name}</div>
                                    <div className="text-xs text-slate-500">
                                        {inc.frequency === 'MONTHLY' ? `Día ${inc.payDay1}` : `Días ${inc.payDay1} y ${inc.payDay2}`}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono font-bold text-emerald-600">{formatCurrency(inc.amount)}</span>
                                    <button onClick={() => deleteIncome(inc.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- BILLS SECTION --- */}
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <Repeat size={20} className="text-rose-600" /> Gastos Recurrentes
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">Pagos fijos (Alquiler, Internet, Seguros) para calcular tu "Piso de Gastos".</p>

                    <div className={`space-y-4 p-4 rounded-xl border mb-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        {editingId && (
                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex justify-between items-center">
                                <span>✏️ Editando Gasto</span>
                                <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 underline">Cancelar</button>
                            </div>
                        )}
                        <input
                            placeholder="Nombre (Ej. Netflix)"
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            value={newExpense.name || ''}
                            onChange={e => setNewExpense({ ...newExpense, name: e.target.value })}
                        />
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Monto"
                                className="w-1/2 px-3 py-2 border rounded-lg text-sm"
                                value={newExpense.amount || ''}
                                onChange={e => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })}
                            />
                            <select
                                className="w-1/2 px-3 py-2 border rounded-lg text-sm"
                                value={newExpense.category || ''}
                                onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                            >
                                <option value="">Categoría</option>
                                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>

                        {/* Account Selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">Cuenta de Pago</label>
                            <select
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                                value={newExpense.account_id || ''}
                                onChange={e => setNewExpense({ ...newExpense, account_id: e.target.value })}
                            >
                                <option value="">Seleccionar Cuenta (Opcional)</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.institution})</option>
                                ))}
                            </select>
                        </div>

                        {/* Frequency Selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">Frecuencia</label>
                            <select
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                value={newExpense.frequency || 'MONTHLY'}
                                onChange={e => setNewExpense({ ...newExpense, frequency: e.target.value as RecurringFrequency })}
                            >
                                <option value="MONTHLY">📅 Mensual</option>
                                <option value="QUARTERLY">📅 Trimestral (cada 3 meses)</option>
                                <option value="SEMI_ANNUAL">📅 Semestral (cada 6 meses)</option>
                                <option value="ANNUAL">📅 Anual (cada año)</option>
                                <option value="BIENNIAL">📅 Bianual (cada 2 años)</option>
                                <option value="TRIENNIAL">📅 Trianual (cada 3 años)</option>
                            </select>
                        </div>

                        {/* Next Due Date */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">Próximo Vencimiento</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                value={newExpense.nextDueDate || ''}
                                onChange={e => setNewExpense({ ...newExpense, nextDueDate: e.target.value })}
                            />
                        </div>

                        {/* Optional End Date */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">Finaliza en (opcional)</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                value={newExpense.endDate || ''}
                                onChange={e => setNewExpense({ ...newExpense, endDate: e.target.value || undefined })}
                                placeholder="Dejar vacío si no expira"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                <StickyNote size={12} /> Notas (Opcional)
                            </label>
                            <textarea
                                placeholder="Detalles adicionales, proveedor, usuario/clave..."
                                className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-none"
                                value={newExpense.notes || ''}
                                onChange={e => setNewExpense({ ...newExpense, notes: e.target.value })}
                            />
                        </div>

                        {/* Smart Reserve Config (for non-monthly) */}
                        {newExpense.frequency !== 'MONTHLY' && (
                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                                        <div className="p-1 bg-white rounded-md shadow-sm">
                                            <Calendar size={14} className="text-indigo-600" />
                                        </div>
                                        Planificar Reserva
                                    </label>
                                    <input
                                        type="checkbox"
                                        checked={newExpense.reservation?.isEnabled || false}
                                        onChange={e => setNewExpense({
                                            ...newExpense,
                                            reservation: {
                                                ...newExpense.reservation,
                                                isEnabled: e.target.checked,
                                                startDate: newExpense.reservation?.startDate || new Date().toISOString().split('T')[0]
                                            }
                                        })}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                </div>

                                {newExpense.reservation?.isEnabled && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Iniciar Reserva</label>
                                                <input
                                                    type="date"
                                                    className="w-full px-2 py-1.5 border border-indigo-200 rounded text-sm bg-white"
                                                    value={newExpense.reservation.startDate}
                                                    onChange={e => setNewExpense({
                                                        ...newExpense,
                                                        reservation: { ...newExpense.reservation!, startDate: e.target.value }
                                                    })}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Ya Ahorrado</label>
                                                <input
                                                    type="number"
                                                    className="w-full px-2 py-1.5 border border-indigo-200 rounded text-sm bg-white"
                                                    value={newExpense.reservation.initialSaved || 0}
                                                    onChange={e => setNewExpense({
                                                        ...newExpense,
                                                        reservation: { ...newExpense.reservation!, initialSaved: parseFloat(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-indigo-600 leading-relaxed">
                                            ℹ️ El sistema calculará automáticamente la cuota mensual necesaria para llegar al vencimiento.
                                            Si te atrasas, la cuota aumentará dinámicamente.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={newExpense.autoPay || false}
                                    onChange={e => setNewExpense({ ...newExpense, autoPay: e.target.checked })}
                                    className="rounded text-indigo-600"
                                />
                                <span className="text-xs text-slate-600">Débito Automático</span>
                            </div>
                        </div>

                        {/* CONFLICT WARNING */}
                        {conflict && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                                <AlertTriangle size={16} className="text-amber-600 mt-0.5" />
                                <div className="text-xs text-amber-800">
                                    <span className="font-bold">Advertencia:</span> Esto supera tu presupuesto de {newExpense.category} ({formatCurrency(conflict.limit)}).
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            {editingId && (
                                <button onClick={cancelEdit} className="w-1/3 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-300">
                                    Cancelar
                                </button>
                            )}
                            <button
                                onClick={saveExpense}
                                className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${editingId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}
                            >
                                {editingId ? 'Guardar Cambios' : 'Agregar Recurrente'}
                            </button>
                        </div>
                    </div>

                    {/* --- FILTERS & VIEW TOGGLE --- */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-4 animate-in fade-in">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar gastos..."
                                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                className="px-3 py-2 border rounded-lg text-sm bg-white"
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                            >
                                <option value="ALL">Todas las Categorías</option>
                                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                            <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                                <button
                                    onClick={() => setViewMode('TABLE')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'TABLE' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <TableIcon size={16} />
                                </button>
                                <button
                                    onClick={() => setViewMode('CARD')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'CARD' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <CreditCard size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {/* --- LIST RENDERING --- */}
                        {sortedExpenses
                            .filter(exp => {
                                const matchesSearch = exp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    (exp.notes && exp.notes.toLowerCase().includes(searchTerm.toLowerCase()));
                                const matchesCategory = filterCategory === 'ALL' || exp.category === filterCategory;
                                return matchesSearch && matchesCategory;
                            })
                            .map(exp => {
                                // Logic for display
                                const today = new Date().toISOString().split('T')[0];
                                const daysUntil = daysBetween(today, exp.nextDueDate || '');
                                const badge = getUrgencyBadge(daysUntil);
                                const frequencyLabel = getFrequencyLabel(exp.frequency || 'MONTHLY');
                                const smartReserve = calculateSmartReserveForExpense(exp, new Date());

                                if (viewMode === 'TABLE') {
                                    return (
                                        <div key={exp.id} className="grid grid-cols-12 gap-2 items-center p-3 border-b border-slate-100 hover:bg-slate-50 text-sm animate-in fade-in">
                                            <div className="col-span-4 font-medium text-slate-700 truncate flex items-center gap-2">
                                                {exp.name}
                                                {exp.notes && (
                                                    <div className="group relative">
                                                        <StickyNote size={12} className="text-amber-400 cursor-help" />
                                                        <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                                                            {exp.notes}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="col-span-3 text-slate-500 truncate text-xs">{exp.category}</div>
                                            <div className="col-span-3">
                                                <div className={`text-[10px] w-fit px-1.5 py-0.5 rounded font-bold flex items-center gap-1 bg-${badge.color}-100 text-${badge.color}-700 border border-${badge.color}-200`}>
                                                    {badge.icon} {daysUntil}d
                                                </div>
                                            </div>
                                            <div className="col-span-2 text-right">
                                                <div className="font-mono font-bold text-rose-600">{formatCurrency(exp.amount)}</div>
                                                <div className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEdit(exp)} className="text-indigo-500"><Edit2 size={12} /></button>
                                                    <button onClick={() => deleteExpense(exp.id)} className="text-rose-400"><Trash2 size={12} /></button>
                                                </div>
                                            </div>
                                            {/* Smart Reserve Message in Table Row? Optional, maybe strictly for details */}
                                            {smartReserve && (
                                                <div className="col-span-12 mt-1 text-[10px] flex justify-end">
                                                    <span className={`px-2 py-0.5 rounded ${smartReserve.isActive ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-500'}`}>
                                                        {smartReserve.message}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div key={exp.id} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors bg-white shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className="font-bold text-slate-800">{exp.name}</div>
                                                    {/* Urgency Badge */}
                                                    <div className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 bg-${badge.color}-100 text-${badge.color}-700 border border-${badge.color}-200`}>
                                                        <span>{badge.icon}</span>
                                                        <span>{badge.label}</span>
                                                        {daysUntil >= 0 && <span className="opacity-75">({daysUntil}d)</span>}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2 items-center">
                                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">
                                                        {frequencyLabel}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        📅 {exp.nextDueDate}
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${exp.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                        {exp.active ? '🟢 Activo' : '⚪ Pausado'}
                                                    </span>
                                                </div>
                                                {/* Notes Indicator */}
                                                {exp.notes && (
                                                    <div className="mt-2 text-xs text-slate-500 bg-amber-50 p-1.5 rounded border border-amber-100 flex gap-2 items-start">
                                                        <StickyNote size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                                        <span className="italic">"{exp.notes}"</span>
                                                    </div>
                                                )}

                                                {/* Smart Reserve Suggestion */}
                                                {smartReserve && (
                                                    <div className={`text-xs font-medium mt-2 flex items-center gap-1 px-2 py-1 rounded w-fit ${smartReserve.isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {smartReserve.message}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono font-bold text-rose-600">{formatCurrency(exp.amount)}</div>
                                                <div className="text-[10px] text-slate-400 mt-1">{exp.category}</div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-2">
                                            <button
                                                onClick={() => handleEdit(exp)}
                                                className="text-indigo-500 hover:text-indigo-600 text-xs flex items-center gap-1 px-2 py-1 hover:bg-indigo-50 rounded transition-colors"
                                            >
                                                ✏️ Editar
                                            </button>
                                            <button
                                                onClick={() => deleteExpense(exp.id)}
                                                className="text-slate-400 hover:text-rose-500 text-xs flex items-center gap-1 px-2 py-1 hover:bg-rose-50 rounded transition-colors"
                                            >
                                                <Trash2 size={12} /> Eliminar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                        {sortedExpenses.length === 0 && (
                            <div className="text-center py-8 text-slate-400 text-sm italic">
                                No hay gastos recurrentes registrados
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
