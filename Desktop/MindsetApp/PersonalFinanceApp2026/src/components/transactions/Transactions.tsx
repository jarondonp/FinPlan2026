import React, { useState, useMemo } from 'react';
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { aiService } from '../../services/aiService';
import { formatCurrency } from '../../utils';
import { Search, Sparkles, Trash2, Loader2, Save } from 'lucide-react';
import { closingService } from '../../services/ClosingService';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { MonthStatusBadge } from '../closing/MonthStatusBadge';
import { CategoryDef, Transaction, Account } from '../../types';

export const Transactions = () => {
    const { filterState } = useGlobalFilter();
    const { scope, selectedAccountIds, timeframe } = filterState;
    const { user } = useAuth();

    // Status State
    const [isLocked, setIsLocked] = useState(false);

    // Check Lock Status
    React.useEffect(() => {
        // closingService needs to be refactored too, but assuming it returns a promise
        // We'll fix closingService next.
        if (timeframe.start) {
            const startDetails = new Date(timeframe.start);
            closingService.getStatus(startDetails, scope).then(status => {
                setIsLocked(status === 'LOCKED' || status === 'CLOSED');
            });
        }
    }, [timeframe, scope]);

    // Queries (Cloud)
    const { data: allTransactions } = useFirestore<Transaction>('transactions');
    const transactions = (allTransactions || []).filter(t => t.scope === scope || (scope === 'PERSONAL' && !t.scope));

    const { data: allAccounts } = useFirestore<Account>('accounts');
    const accounts = (allAccounts || []).filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope));

    const { data: allCategories } = useFirestore<CategoryDef>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    // Filters
    const [search, setSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState("ALL");

    // AI State
    const [isCategorizing, setIsCategorizing] = useState(false);

    // Filter Logic

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            // 1. Search Filter
            const matchesSearch = (t.description_original || "").toLowerCase().includes(search.toLowerCase()) ||
                (t.description_normalized || "").toLowerCase().includes(search.toLowerCase());

            // 2. Category Filter
            const matchesCategory = filterCategory === "ALL" || t.category === filterCategory;

            // 3. Timeframe Filter
            // String comparison usually works for ISO dates YYYY-MM-DD
            // But let's be safe if timeframe objects are Dates or Strings
            const tDateStr = t.date;
            // timeframe.start/end might be strings from global filter context
            const startStr = timeframe.start instanceof Date ? timeframe.start.toISOString().split('T')[0] : timeframe.start;
            const endStr = timeframe.end instanceof Date ? timeframe.end.toISOString().split('T')[0] : timeframe.end;

            let matchesTimeframe = true;
            if (startStr && endStr) {
                matchesTimeframe = tDateStr >= startStr && tDateStr <= endStr;
            }

            // 4. Account Filter
            const matchesAccount = selectedAccountIds.length === 0 || selectedAccountIds.includes(t.account_id);

            return matchesSearch && matchesCategory && matchesTimeframe && matchesAccount;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, search, filterCategory, timeframe, selectedAccountIds]);


    // Handlers
    const handleDelete = async (id: string) => {
        if (!user) return;
        if (isLocked) return alert("Acción denegada: El mes está cerrado.");
        if (confirm("¿Eliminar transacción?")) {
            try {
                await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
            } catch (e) {
                console.error("Error deleting transaction", e);
            }
        }
    }

    const handleCategoryChange = async (id: string, newCategory: string) => {
        if (!user) return;
        if (isLocked) return alert("El mes está cerrado. No se pueden editar categorías.");
        try {
            await setDoc(doc(db, 'users', user.uid, 'transactions', id), { category: newCategory, needs_review: false }, { merge: true });
        } catch (e) {
            console.error("Error updating category", e);
        }
    };

    const handleAutoCategorize = async () => {
        if (!user) return;
        const uncategorized = transactions.filter(t => t.category === 'Uncategorized' || t.category === 'Unknown');
        if (uncategorized.length === 0) return alert("No hay transacciones sin categorizar.");

        setIsCategorizing(true);
        const catNames = categories.map(c => c.name);

        try {
            // Prepare inputs
            const inputs = uncategorized.map(t => ({ id: t.id, description: t.description_original }));

            // Call AI
            const results = await aiService.categorizeTransactions(inputs, catNames);

            // Build updates using Batch
            const batch = writeBatch(db);
            results.forEach(res => {
                const docRef = doc(db, 'users', user.uid, 'transactions', res.id);
                batch.update(docRef, { category: res.category, needs_review: false });
            });

            await batch.commit();

            alert(`Categorización completada. ${results.length} transacciones actualizadas.`);

        } catch (e) {
            alert("Error al categorizar. Verifica tu API Key.");
            console.error(e);
        } finally {
            setIsCategorizing(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500 h-full flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Transacciones</h1>
                        <MonthStatusBadge />
                    </div>
                    <p className="text-slate-500">Historial completo de movimientos.</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {/* AI Button */}
                    <button
                        onClick={handleAutoCategorize}
                        disabled={isCategorizing || isLocked}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 hover:shadow-xl transition-all flex items-center gap-2 text-sm disabled:opacity-50 disabled:grayscale"
                        title={isLocked ? "Mes cerrado. No se pueden modificar transacciones." : "Categorizar con IA"}
                    >
                        {isCategorizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {isCategorizing ? 'Analizando...' : 'Auto-Categorizar con AI'}
                    </button>

                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input
                            placeholder="Buscar..."
                            className="pl-9 pr-4 py-2 border rounded-lg text-sm w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="px-3 py-2 border rounded-lg text-sm bg-white"
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                    >
                        <option value="ALL">Todas las Categorías</option>
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
            </header>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Fecha</th>
                                <th className="px-6 py-3">Descripción</th>
                                <th className="px-6 py-3">Categoría</th>
                                <th className="px-6 py-3">Cuenta</th>
                                <th className="px-6 py-3 text-right">Monto</th>
                                <th className="px-6 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTransactions.map(t => {
                                const accountName = accounts.find(a => a.id === t.account_id)?.name || "Unknown";
                                return (
                                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-mono text-xs">
                                            {(() => {
                                                const [y, m, d] = t.date.split('-').map(Number);
                                                return new Date(y, m - 1, d).toLocaleDateString();
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            <div className="whitespace-normal break-words max-w-sm text-xs" title={t.description_original}>
                                                {t.description_normalized}
                                            </div>
                                            {t.needs_review && <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded ml-2">Revisar</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                disabled={isLocked}
                                                className={`text-xs font-bold px-2 py-1 rounded-lg border-transparent hover:border-slate-200 hover:bg-white transition-all cursor-pointer focus:ring-2 focus:ring-indigo-500 outline-none
                                                    ${t.category === 'Uncategorized' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}
                                                    ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                value={t.category}
                                                onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                                            >
                                                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs">
                                            {accountName}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-mono font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                            {formatCurrency(t.amount)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleDelete(t.id)}
                                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-all p-1"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    {filteredTransactions.length === 0 && (
                        <div className="p-12 text-center text-slate-400">No se encontraron transacciones.</div>
                    )}
                </div>
                <div className="bg-slate-50 p-3 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
                    <span>Mostrando {filteredTransactions.length} registros</span>
                    <span>Total: {transactions.length}</span>
                </div>
            </div>
        </div>
    );
};
