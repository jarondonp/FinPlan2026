import React, { useState } from 'react';
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { CategoryDef } from '../../types';
import { getRandomColor, formatCurrency } from '../../utils';
import { Tag, Plus, X, Edit2 } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';

export const CategoryManager = () => {
    const { scope } = useScope();
    const { user } = useAuth(); // Auth context

    // Cloud Data
    const { data: allCategories } = useFirestore<CategoryDef>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingCategory, setEditingCategory] = useState<CategoryDef | null>(null);

    const addCategory = async () => {
        if (!user || !newCategoryName) return;

        if (categories.find((c) => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
            alert("La categoría ya existe");
            return;
        }

        // Use name as ID for categories (simple & unique per user scope ideally, but globally unique in collection per user)
        // We will store in users/{uid}/categories/{name} to ensure uniqueness/easy access or use generated ID.
        // The previous code used 'name' as key for deletes. Let's stick to using 'name' as ID if safe, or generate ID.
        // Ideally URL-safe name. Let's use simple name but handle spaces?
        // Better: use random ID, store name as field.
        // BUT wait, existing logic uses 'name' as identifier?
        // Dexie schema: categories: 'name, scope, ...' -> name is primary key?
        // Let's assume unique names.

        const catId = newCategoryName.trim(); // ID based on name for now

        const newCat: CategoryDef = { name: newCategoryName, color: getRandomColor(), scope: scope };

        try {
            await setDoc(doc(db, 'users', user.uid, 'categories', catId), newCat);
            setNewCategoryName("");
        } catch (e) {
            console.error("Error adding category", e);
            alert("Error al guardar categoría");
        }
    };

    const deleteCategory = async (name: string) => {
        if (!user) return;
        if (window.confirm("¿Seguro que deseas eliminar esta categoría? Se desvinculará de las transacciones.")) {
            try {
                // Assuming ID matches name as per addCategory logic
                await deleteDoc(doc(db, 'users', user.uid, 'categories', name));
            } catch (e) {
                console.error("Error deleting category", e);
                alert("Error al eliminar");
            }
        }
    };

    const loadDefaults = async () => {
        if (!user) return;
        const defaults = scope === 'BUSINESS'
            ? ["Ventas", "Servicios", "Nómina", "Alquiler", "Marketing", "Software", "Impuestos", "Otros Gastos"]
            : ["Salario", "Vivienda", "Comida", "Transporte", "Servicios", "Entretenimiento", "Salud", "Ahorro"];

        try {
            await Promise.all(defaults.map(name => {
                const newCat: CategoryDef = { name, color: getRandomColor(), scope };
                return setDoc(doc(db, 'users', user.uid, 'categories', name), newCat);
            }));
            // alert("Categorías por defecto cargadas en la nube.");
        } catch (e) {
            console.error("Error loading defaults", e);
            alert("Error al cargar defaults");
        }
    };

    const updateCategoryLimit = async (name: string, limit: number) => {
        if (!user) return;
        const safeLimit = isNaN(limit) ? 0 : limit;
        try {
            await setDoc(doc(db, 'users', user.uid, 'categories', name), { budgetLimit: safeLimit }, { merge: true });
            setEditingCategory(null);
        } catch (e) {
            console.error("Error updating limit", e);
        }
    }

    // Render logic remains similar...
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
