import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { Account, AccountType } from '../../types';
import { formatCurrency, generateId } from '../../utils';
import { Wallet, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';

export const AccountManager = () => {
    const { scope } = useScope();
    const accounts = useLiveQuery(() => db.accounts
        .filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope))
        .toArray(), [scope]) || [];
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Account>>({});

    const handleEdit = (acc: Account) => {
        setEditingId(acc.id);
        setEditForm({ ...acc });
    };

    const handleSave = async () => {
        if (!editForm.name || !editForm.type) return;

        if (editingId === 'NEW') {
            await db.accounts.add({
                ...editForm,
                id: generateId(),
                balance: editForm.balance || 0,
                currency: 'USD',
                scope: scope
            } as Account);
        } else {
            await db.accounts.update(editingId!, editForm);
        }
        setEditingId(null);
        setEditForm({});
    };

    const handleDelete = (id: string) => {
        if (confirm("¿Seguro que deseas eliminar esta cuenta? Se perderá el historial asociado.")) {
            db.accounts.delete(id);
        }
    };

    const startNewAccount = () => {
        setEditingId('NEW');
        setEditForm({ type: 'Checking', currency: 'USD', balance: 0 });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Wallet size={18} className="text-indigo-600" /> Mis Cuentas
                    </h3>
                    <p className="text-sm text-slate-500">Gestiona tus cuentas bancarias, tarjetas y efectivo.</p>
                </div>
                <button onClick={startNewAccount} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 flex items-center gap-2">
                    <Plus size={16} /> Nueva Cuenta
                </button>
            </div>

            {editingId === 'NEW' && (
                <AccountEditor form={editForm} setForm={setEditForm} onSave={handleSave} onCancel={() => setEditingId(null)} />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map(acc => (
                    editingId === acc.id ? (
                        <AccountEditor key={acc.id} form={editForm} setForm={setEditForm} onSave={handleSave} onCancel={() => setEditingId(null)} />
                    ) : (
                        <div key={acc.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{acc.type}</div>
                                    <h4 className="font-bold text-slate-800 text-lg">{acc.name}</h4>
                                    <p className="text-xs text-slate-500">{acc.institution}</p>
                                </div>
                                <div className={`text-lg font-mono font-bold ${acc.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(acc.balance)}
                                </div>
                            </div>

                            {(acc.type === 'Credit Card' || acc.type === 'Loan') && (
                                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <span className="text-slate-400 block">APR</span>
                                        <span className="font-bold text-slate-700">{acc.apr}%</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block">Corte</span>
                                        <span className="font-bold text-slate-700">Día {acc.closingDay || '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block">Límite</span>
                                        <span className="font-bold text-slate-700">{acc.limit ? formatCurrency(acc.limit) : '-'}</span>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                <button onClick={() => handleEdit(acc)} className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(acc.id)} className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
};

const AccountEditor = ({ form, setForm, onSave, onCancel }: any) => {
    return (
        <div className="bg-slate-50 p-6 rounded-xl border border-indigo-200 animate-in fade-in">
            <h4 className="font-bold text-slate-800 mb-4">{form.id ? 'Editar Cuenta' : 'Nueva Cuenta'}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Nombre</label>
                    <input className="w-full px-3 py-2 border rounded-lg text-sm" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Chase Sapphire" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Institución</label>
                    <input className="w-full px-3 py-2 border rounded-lg text-sm" value={form.institution || ""} onChange={e => setForm({ ...form, institution: e.target.value })} placeholder="Ej. Chase" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
                    <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.type || "Checking"} onChange={e => setForm({ ...form, type: e.target.value })}>
                        {["Checking", "Savings", "Credit Card", "Loan", "Investment"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Saldo Actual</label>
                    <div className="relative">
                        <input
                            type="number"
                            disabled={!!form.id} // Disable if editing existing
                            className={`w-full px-3 py-2 border rounded-lg text-sm ${!!form.id ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                            value={form.balance || 0}
                            onChange={e => setForm({ ...form, balance: parseFloat(e.target.value) })}
                        />
                        {!!form.id && (
                            <div className="absolute right-0 top-full mt-1 text-[10px] text-amber-600 font-medium">
                                * Para ajustar, usa una transacción.
                            </div>
                        )}
                    </div>
                </div>

                {/* Advanced Fields for Credit/Loans */}
                {(form.type === 'Credit Card' || form.type === 'Loan') && (
                    <>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Tasa Interés Anual (APR %)</label>
                            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.apr || 0} onChange={e => setForm({ ...form, apr: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Límite de Crédito</label>
                            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.limit || 0} onChange={e => setForm({ ...form, limit: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Día de Corte (1-31)</label>
                            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.closingDay || ""} onChange={e => setForm({ ...form, closingDay: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Día Límite Pago (1-31)</label>
                            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.dueDay || ""} onChange={e => setForm({ ...form, dueDay: parseFloat(e.target.value) })} />
                        </div>
                    </>
                )}
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button onClick={onSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-200">Guardar Cuenta</button>
            </div>
        </div>
    )
}
