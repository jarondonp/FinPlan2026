import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { CategoryDef } from '../../types';
import { getRandomColor, formatCurrency } from '../../utils';
import { Tag, Plus, X, Edit2 } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';

export const CategoryManager = () => {
    const { scope } = useScope();
    const categories = useLiveQuery(() => db.categories
        .filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope))
        .toArray(), [scope]) || [];
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingCategory, setEditingCategory] = useState<CategoryDef | null>(null);

    const addCategory = async () => {
        if (!newCategoryName || categories.find((c) => c.name === newCategoryName)) return;
        const newCat: CategoryDef = { name: newCategoryName, color: getRandomColor(), scope: scope };
        await db.categories.add(newCat);
        setNewCategoryName("");
    };

    const deleteCategory = async (name: string) => {
        if (window.confirm("¿Seguro que deseas eliminar esta categoría? Se desvinculará de las transacciones.")) {
            await db.categories.delete(name);
        }
    };

    const loadDefaults = async () => {
        const defaults = scope === 'BUSINESS'
            ? ["Ventas", "Servicios", "Nómina", "Alquiler", "Marketing", "Software", "Impuestos", "Otros Gastos"]
            : ["Salario", "Vivienda", "Comida", "Transporte", "Servicios", "Entretenimiento", "Salud", "Ahorro"];

        await db.transaction('rw', db.categories, async () => {
            for (const name of defaults) {
                if (!await db.categories.get(name)) {
                    await db.categories.add({ name, color: getRandomColor(), scope });
                }
            }
        });
    };

    const updateCategoryLimit = async (name: string, limit: number) => {
        await db.categories.update(name, { budgetLimit: limit });
        setEditingCategory(null);
    }

    return (
        <div className="space-y-6 w-full lg:col-span-2">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Tag size={18} className="text-emerald-600" /> Gestionar Categorías
                </h3>
                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        placeholder="Nueva categoría..."
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <button
                        onClick={addCategory}
                        disabled={!newCategoryName}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                        <Plus size={18} />
                    </button>
                    {categories.length === 0 && (
                        <button onClick={loadDefaults} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-xs hover:bg-slate-200 border border-slate-200 whitespace-nowrap">
                            Cargar {scope === 'BUSINESS' ? 'Empresa' : 'Personales'}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
                    {categories.map((c: CategoryDef) => (
                        <div key={c.name} className={`flex flex-col gap-2 p-3 rounded-xl text-sm font-medium border transition-all ${c.color.replace('bg-', 'border-').replace('text-', 'border-opacity-30 ')} bg-white`}>
                            <div className="flex justify-between items-center">
                                <div className={`px-2 py-0.5 rounded-md text-xs font-bold ${c.color}`}>
                                    {c.name}
                                </div>
                                <button
                                    onClick={() => deleteCategory(c.name)}
                                    className="opacity-50 hover:opacity-100 hover:text-red-700"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                                <div className="text-xs text-slate-400">Límite Mensual:</div>
                                {editingCategory?.name === c.name ? (
                                    <input
                                        autoFocus
                                        type="number"
                                        className="w-20 px-1 py-0.5 text-xs border border-slate-300 rounded"
                                        defaultValue={c.budgetLimit}
                                        onBlur={(e) => updateCategoryLimit(c.name, parseFloat(e.target.value))}
                                        onKeyDown={(e) => e.key === 'Enter' && updateCategoryLimit(c.name, parseFloat(e.currentTarget.value))}
                                    />
                                ) : (
                                    <div onClick={() => setEditingCategory(c)} className="text-xs font-mono font-bold text-slate-600 cursor-pointer hover:bg-slate-100 px-2 py-0.5 rounded border border-transparent hover:border-slate-200 flex items-center gap-1">
                                        {c.budgetLimit ? formatCurrency(c.budgetLimit) : "$ --"} <Edit2 size={8} className="opacity-50" />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
