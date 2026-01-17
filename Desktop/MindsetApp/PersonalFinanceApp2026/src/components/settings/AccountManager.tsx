import React, { useState } from 'react';
import { db } from '../../firebase/config'; // Firestore instance
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Account, AccountType } from '../../types';
import { formatCurrency, generateId } from '../../utils';
import { Wallet, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';
import { useAccountBalance } from '../../hooks/useAccountBalance';
import { DebtIndicator } from './DebtIndicator';

export const AccountManager = () => {
    const { scope } = useScope();
    const { user } = useAuth(); // Get authenticated user
    const accounts = useAccountBalance(scope);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Account>>({});
    const [originalBalance, setOriginalBalance] = useState<number>(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const handleEdit = (acc: Account) => {
        setEditingId(acc.id);
        // Show balance as POSITIVE to user (regardless of internal sign)
        setEditForm({
            ...acc,
            balance: Math.abs(acc.balance || 0) as any
        });
        setOriginalBalance(acc.balance || 0);  // Keep original with sign for comparison
    };

    const handleSave = async () => {
        if (!editForm.name || !editForm.type) return;

        // Check if balance changed for existing account
        if (editingId !== 'NEW' && editForm.balance !== Math.abs(originalBalance)) {
            setShowConfirmDialog(true);
            return;
        }

        await saveAccount();
    };


    // ... (rest of state)

    const saveAccount = async () => {
        if (!user) {
            alert("Error: No se detecta usuario logueado. Recarga la página.");
            return;
        }

        // ... (normalization logic)
        let normalizedBalance = parseFloat(editForm.balance as any) || 0;

        if (editForm.type === 'Credit Card' || editForm.type === 'Loan') {
            normalizedBalance = -Math.abs(normalizedBalance);
        } else {
            normalizedBalance = Math.abs(normalizedBalance);
        }

        const accountId = editingId === 'NEW' ? generateId() : editingId!;

        try {
            // Firestore Write: users/{uid}/accounts/{accountId}
            await setDoc(doc(db, 'users', user.uid, 'accounts', accountId), {
                ...editForm,
                id: accountId,
                balance: normalizedBalance,
                currency: 'USD',
                scope: scope
            });
            // No need to manually update state, the useFirestore subscription will auto-update the list
        } catch (error) {
            console.error("Error saving account:", error);
            alert("Error al guardar en la nube. Revisa tu conexión.");
            return;
        }

        setEditingId(null);
        setEditForm({});
        setShowConfirmDialog(false);
    };

    const handleDelete = async (id: string) => {
        if (!user) return;
        if (confirm("¿Seguro que deseas eliminar esta cuenta? Se perderá el historial asociado.")) {
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'accounts', id));
            } catch (error) {
                console.error("Error deleting account:", error);
                alert("Error al eliminar.");
            }
        }
    };

    const startNewAccount = () => {
        setEditingId('NEW');
        setEditForm({ type: 'Checking', currency: 'USD', balance: 0 });
        setOriginalBalance(0);
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
                        <div key={acc.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{acc.type}</div>
                                    <h4 className="font-bold text-slate-800 text-lg">{acc.name}</h4>
                                    <p className="text-xs text-slate-500">{acc.institution}</p>
                                </div>
                                <div className={`text-lg font-mono font-bold ${acc.dynamicBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(acc.dynamicBalance)}
                                </div>
                            </div>

                            {(acc.type === 'Credit Card' || acc.type === 'Loan') && (
                                <>
                                    <DebtIndicator accountId={acc.id} accounts={accounts} />
                                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs relative z-10">
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
                                </>
                            )}

                            <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end relative z-10">
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

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <BalanceChangeConfirmDialog
                    accountName={editForm.name || ''}
                    oldBalance={originalBalance}
                    newBalance={editForm.balance || 0}
                    currentDynamicBalance={accounts.find(a => a.id === editingId)?.dynamicBalance || 0}
                    onConfirm={saveAccount}
                    onCancel={() => setShowConfirmDialog(false)}
                />
            )}
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
                    <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                        {(form.type === 'Credit Card' || form.type === 'Loan')
                            ? 'Deuda Inicial (¿Cuánto debes?)'
                            : 'Saldo Inicial (¿Cuánto tienes?)'}
                        {!!form.id && (
                            <span className="text-amber-500" title="Cambiar este valor afectará todos los cálculos históricos">⚠️</span>
                        )}
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            className={`w-full px-3 py-2 border rounded-lg text-sm ${!!form.id ? 'border-amber-300 bg-amber-50' : ''}`}
                            value={form.balance || 0}
                            onChange={e => setForm({ ...form, balance: parseFloat(e.target.value) })}
                            placeholder={(form.type === 'Credit Card' || form.type === 'Loan') ? 'Ej. 2000' : 'Ej. 5000'}
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            {(form.type === 'Credit Card' || form.type === 'Loan')
                                ? '💡 Ingresa solo el monto que debes (sin signo negativo)'
                                : '💡 Ingresa el monto disponible en la cuenta'}
                        </p>
                        {!!form.id && (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                                <strong>⚠️ Advertencia:</strong> Cambiar el saldo inicial afectará todos los cálculos históricos de balance.
                                Solo edita este campo si estás configurando la cuenta por primera vez o corrigiendo un error de registro inicial.
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
                            <label className="block text-xs font-bold text-slate-500 mb-1">Pago Mínimo Actual</label>
                            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.minPayment || 0} onChange={e => setForm({ ...form, minPayment: parseFloat(e.target.value) })} placeholder="Ej. 35" />
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

interface BalanceChangeConfirmDialogProps {
    accountName: string;
    oldBalance: number;
    newBalance: number;
    currentDynamicBalance: number;
    onConfirm: () => void;
    onCancel: () => void;
}

const BalanceChangeConfirmDialog = ({ accountName, oldBalance, newBalance, currentDynamicBalance, onConfirm, onCancel }: BalanceChangeConfirmDialogProps) => {
    const difference = newBalance - oldBalance;
    const newDynamicBalance = currentDynamicBalance + difference;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-in slide-in-from-bottom-4">
                <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="text-2xl">⚠️</span>
                        Confirmar Cambio de Saldo Inicial
                    </h3>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600">
                        Estás a punto de cambiar el <strong>Saldo Inicial (Ancla Histórica)</strong> de la cuenta <strong className="text-indigo-600">{accountName}</strong>.
                    </p>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Saldo Inicial Anterior:</span>
                            <span className="font-mono font-bold text-slate-800">{formatCurrency(oldBalance)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Saldo Inicial Nuevo:</span>
                            <span className="font-mono font-bold text-amber-600">{formatCurrency(newBalance)}</span>
                        </div>
                        <div className="border-t border-amber-300 pt-2 mt-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Balance Dinámico Actual:</span>
                                <span className="font-mono font-bold">{formatCurrency(currentDynamicBalance)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Balance Dinámico Nuevo:</span>
                                <span className={`font-mono font-bold ${newDynamicBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(newDynamicBalance)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-600">
                            <strong>Impacto:</strong> Este cambio afectará todos los cálculos históricos de balance.
                            Todas las transacciones existentes se sumarán al nuevo ancla.
                        </p>
                    </div>
                </div>
                <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-amber-200"
                    >
                        Confirmar Cambio
                    </button>
                </div>
            </div>
        </div>
    );
};
