import React, { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { BudgetItem } from '../../types/budgetEditHistory';
import { formatCurrency } from '../../utils';
import { generateId } from '../../utils';

interface InlineItemEditorProps {
    category: string;
    budgetType: 'fixed' | 'reserved' | 'variable';
    initialItems: BudgetItem[];
    onSave: (items: BudgetItem[], reason?: string) => Promise<void>;
    onCancel: () => void;
}

export const InlineItemEditor: React.FC<InlineItemEditorProps> = ({
    category,
    budgetType,
    initialItems,
    onSave,
    onCancel
}) => {
    const [items, setItems] = useState<BudgetItem[]>(initialItems);
    const [editReason, setEditReason] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAddItem = () => {
        setItems([...items, {
            id: generateId(),
            name: '',
            amount: 0
        }]);
    };

    const handleRemoveItem = (id: string) => {
        setItems(items.filter(item => item.id !== id));
    };

    const handleUpdateItem = (id: string, field: keyof BudgetItem, value: any) => {
        setItems(items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handleSave = async () => {
        // Validate: all items must have name and non-zero amount (negatives allowed)
        const validItems = items.filter(item => item.name.trim() && item.amount !== 0);

        // Allow saving empty list (to clear budget)
        // Only block if user has items but they are invalid (e.g. empty names)
        if (items.length > 0 && validItems.length === 0) {
            alert('Debes completar los datos de los items');
            return;
        }

        setSaving(true);
        try {
            await onSave(validItems, editReason || undefined);
        } catch (error) {
            console.error('Error saving items:', error);
            alert('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

    return (
        <div className="bg-white border-2 border-emerald-300 rounded-lg p-4 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-emerald-700 text-sm">
                    ✏️ Editando: {category} - {budgetType === 'variable' ? 'Variable' : budgetType === 'fixed' ? 'Fijo' : 'Reserva'}
                </h4>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Total:</span>
                    <span className="font-mono font-bold text-emerald-700">{formatCurrency(total)}</span>
                </div>
            </div>

            {/* Items List */}
            <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                {items.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-4">
                        No hay items. Click "Agregar Item" para comenzar.
                    </p>
                ) : (
                    items.map((item, index) => (
                        <div key={item.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200">
                            <span className="text-xs text-slate-500 w-6">{index + 1}.</span>
                            <input
                                type="text"
                                placeholder="Nombre del item"
                                className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-emerald-500"
                                value={item.name}
                                onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                            />
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500">$</span>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-emerald-500"
                                    value={item.amount || ''}
                                    onChange={(e) => handleUpdateItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                                    // min="0" removed to allow negative adjustments
                                    step="0.01"
                                />
                            </div>
                            <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1 hover:bg-red-100 rounded text-red-600 transition-colors"
                                title="Eliminar item"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Add Item Button */}
            <button
                onClick={handleAddItem}
                className="w-full mb-3 py-2 border-2 border-dashed border-emerald-300 rounded text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
                <Plus size={16} />
                Agregar Item
            </button>

            {/* Edit Reason */}
            <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                    Razón del cambio (opcional):
                </label>
                <input
                    type="text"
                    placeholder="Ej: Ajuste por inflación"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-emerald-500"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
                <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors font-medium text-sm flex items-center justify-center gap-2"
                    disabled={saving}
                >
                    <X size={16} />
                    Cancelar
                </button>
                <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    disabled={saving}
                >
                    {saving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save size={16} />
                            Guardar Cambios
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
