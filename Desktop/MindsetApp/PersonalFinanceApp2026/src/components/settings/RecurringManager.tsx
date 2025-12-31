import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { IncomeSource, RecurringExpense } from '../../types';
import { generateId, formatCurrency } from '../../utils';
import { Calendar, DollarSign, Plus, Trash2, CheckCircle, Repeat, ArrowRight, AlertTriangle } from 'lucide-react';

export const RecurringManager = () => {
    const incomes = useLiveQuery(() => db.incomeSources.toArray()) || [];
    const expenses = useLiveQuery(() => db.recurringExpenses.toArray()) || [];
    const categories = useLiveQuery(() => db.categories.toArray()) || [];

    const [newIncome, setNewIncome] = useState<Partial<IncomeSource>>({ frequency: 'MONTHLY' });
    const [newExpense, setNewExpense] = useState<Partial<RecurringExpense>>({ active: true, autoPay: false });

    // --- Validation Logic ---
    const getBudgetConflict = (amount: number, categoryName: string) => {
        const category = categories.find(c => c.name === categoryName);
        if (!category) return null;

        // Existing expenses in this category
        const existingExpenses = expenses
            .filter(e => e.category === categoryName && e.active)
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
        if (!newIncome.name || !newIncome.amount || !newIncome.payDay1) return;

        await db.incomeSources.add({
            ...newIncome,
            id: generateId(),
            amount: parseFloat(newIncome.amount.toString()),
            payDay1: parseInt(newIncome.payDay1.toString()),
            payDay2: newIncome.frequency === 'BIWEEKLY' ? (newIncome.payDay2 ? parseInt(newIncome.payDay2.toString()) : parseInt(newIncome.payDay1.toString()) + 15) : undefined
        } as IncomeSource);
        setNewIncome({ frequency: 'MONTHLY' });
    };

    const deleteIncome = (id: string) => db.incomeSources.delete(id);

    // --- Expense Handlers ---
    const addExpense = async () => {
        if (!newExpense.name || !newExpense.amount || !newExpense.dueDay || !newExpense.category) return;
        const amount = parseFloat(newExpense.amount.toString());

        // Validate Budget Update
        if (conflict) {
            const shouldUpdate = confirm(`⚠️ Este gasto excede tu presupuesto de ${newExpense.category} por ${formatCurrency(conflict.diff)}.\n\n¿Deseas aumentar el presupuesto automáticamente a ${formatCurrency(conflict.newTotal)}?`);
            if (shouldUpdate) {
                await db.categories.update(newExpense.category, { budgetLimit: conflict.newTotal });
            }
        }

        await db.recurringExpenses.add({
            ...newExpense,
            id: generateId(),
            amount: amount,
            dueDay: parseInt(newExpense.dueDay.toString())
        } as RecurringExpense);
        setNewExpense({ active: true, autoPay: false });
    };

    const deleteExpense = (id: string) => db.recurringExpenses.delete(id);

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

                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
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
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">Vence el día:</span>
                                <input
                                    type="number" placeholder="1-31" min="1" max="31"
                                    className="w-16 px-2 py-1 border rounded text-sm text-center"
                                    value={newExpense.dueDay || ''}
                                    onChange={e => setNewExpense({ ...newExpense, dueDay: parseInt(e.target.value) })}
                                />
                            </div>
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

                        <button onClick={addExpense} className="w-full py-2 bg-rose-600 text-white rounded-lg font-bold text-sm hover:bg-rose-700">
                            Agregar Recurrente
                        </button>
                    </div>

                    <div className="space-y-3">
                        {expenses.map(exp => (
                            <div key={exp.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-slate-50">
                                <div>
                                    <div className="font-bold text-slate-800">{exp.name}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                        <span>Día {exp.dueDay}</span>
                                        {exp.autoPay && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">Auto</span>}
                                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{exp.category}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono font-bold text-rose-600">{formatCurrency(exp.amount)}</span>
                                    <button onClick={() => deleteExpense(exp.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
