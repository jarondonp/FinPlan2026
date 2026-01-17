import React, { useState, useEffect } from 'react';
import { X, History, TrendingUp, TrendingDown, Clock, Trash2 } from 'lucide-react';
import { BudgetEditHistory } from '../../types/budgetEditHistory';
import { BudgetEditHistoryService } from '../../services/BudgetEditHistoryService';
import { formatCurrency } from '../../utils';

interface EditHistoryModalProps {
    userId: string;
    scope: 'personal' | 'business';
    month: string;
    category?: string;
    onClose: () => void;
}

export const EditHistoryModal: React.FC<EditHistoryModalProps> = ({
    userId,
    scope,
    month,
    category,
    onClose
}) => {
    const [history, setHistory] = useState<BudgetEditHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEntry, setSelectedEntry] = useState<BudgetEditHistory | null>(null);

    useEffect(() => {
        loadHistory();
    }, [userId, scope, month, category]);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const data = await BudgetEditHistoryService.getHistory(userId, scope, month, category);
            setHistory(data);
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearHistory = async () => {
        if (!confirm('¿Estás seguro de borrar TODO el historial de este mes? Esta acción no se puede deshacer.')) return;

        try {
            setLoading(true);
            const { deleteDoc, doc } = await import('firebase/firestore');
            const { db } = await import('../../firebase/config');

            // Delete all currently loaded history entries
            await Promise.all(history.map(entry => deleteDoc(doc(db, 'users', userId, 'budget_edit_history', entry.id))));

            setHistory([]);
            alert('Historial borrado exitosamente.');
        } catch (error) {
            console.error('Error clearing history:', error);
            alert('Error al borrar el historial');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp: any) => {
        const date = timestamp.toDate();
        const options: Intl.DateTimeFormatOptions = {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        return new Intl.DateTimeFormat('es-ES', options).format(date);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <div className="flex items-center gap-3">
                        <History size={24} className="text-indigo-600" />
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">
                                Historial de Ediciones
                            </h2>
                            <p className="text-sm text-slate-600">
                                {month} - {scope === 'personal' ? 'Personal' : 'Business'}
                                {category && ` - ${category}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {history.length > 0 && (
                            <button
                                onClick={handleClearHistory}
                                className="p-2 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold"
                                title="Borrar todo el historial"
                            >
                                <span className="hidden sm:inline">Limpiar</span>
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="mt-4 text-slate-600">Cargando historial...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12">
                            <History size={48} className="mx-auto text-slate-300 mb-4" />
                            <p className="text-slate-600">No hay ediciones registradas</p>
                            <p className="text-sm text-slate-500 mt-2">
                                Las ediciones se guardan automáticamente cuando modificas el presupuesto
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map((entry) => (
                                <div
                                    key={entry.id}
                                    onClick={() => setSelectedEntry(entry === selectedEntry ? null : entry)}
                                    className={`border rounded-lg p-4 cursor-pointer transition-all ${selectedEntry?.id === entry.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'
                                        }`}
                                >
                                    {/* Entry Summary */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Clock size={14} className="text-slate-500" />
                                                <span className="text-sm font-medium text-slate-700">
                                                    {formatDate(entry.timestamp)}
                                                </span>
                                            </div>
                                            <div className="font-bold text-slate-800">
                                                {entry.category} - {entry.budget_type.charAt(0).toUpperCase() + entry.budget_type.slice(1)}
                                            </div>
                                            {entry.edit_reason && (
                                                <p className="text-sm text-slate-600 italic mt-1">
                                                    "{entry.edit_reason}"
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-lg font-bold ${entry.total_change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {entry.total_change >= 0 ? '+' : ''}{formatCurrency(entry.total_change)}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {formatCurrency(entry.previous_total)} → {formatCurrency(entry.new_total)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex gap-4 mt-3 text-xs text-slate-600">
                                        {entry.items_added > 0 && (
                                            <span className="flex items-center gap-1">
                                                <TrendingUp size={12} className="text-green-600" />
                                                {entry.items_added} agregado{entry.items_added > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {entry.items_removed > 0 && (
                                            <span className="flex items-center gap-1">
                                                <TrendingDown size={12} className="text-red-600" />
                                                {entry.items_removed} eliminado{entry.items_removed > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {entry.items_modified > 0 && (
                                            <span>
                                                {entry.items_modified} modificado{entry.items_modified > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* Expanded Details */}
                                    {selectedEntry?.id === entry.id && (
                                        <div className="mt-4 pt-4 border-t space-y-3">
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Previous State */}
                                                <div>
                                                    <h4 className="font-semibold text-sm text-slate-700 mb-2">Antes:</h4>
                                                    {entry.previous_items.length === 0 ? (
                                                        <p className="text-sm text-slate-500 italic">Sin items</p>
                                                    ) : (
                                                        <ul className="space-y-1">
                                                            {entry.previous_items.map(item => (
                                                                <li key={item.id} className="text-sm flex justify-between">
                                                                    <span className="text-slate-700">{item.name}</span>
                                                                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>

                                                {/* New State */}
                                                <div>
                                                    <h4 className="font-semibold text-sm text-slate-700 mb-2">Después:</h4>
                                                    {entry.new_items.length === 0 ? (
                                                        <p className="text-sm text-slate-500 italic">Sin items</p>
                                                    ) : (
                                                        <ul className="space-y-1">
                                                            {entry.new_items.map(item => (
                                                                <li key={item.id} className="text-sm flex justify-between">
                                                                    <span className="text-slate-700">{item.name}</span>
                                                                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-slate-50 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};
