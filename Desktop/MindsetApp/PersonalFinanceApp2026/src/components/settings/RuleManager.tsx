import React, { useState } from 'react';
// import { useLiveQuery } from 'dexie-react-hooks'; // Removed
// import { db } from '../../db/db'; // Removed
import { db } from '../../firebase/config';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { Rule, CategoryDef } from '../../types';
import { generateId } from '../../utils';
import { BrainCircuit, X, Plus } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';

export const RuleManager = () => {
    const { scope } = useScope();
    const { user } = useAuth();

    // Fetch Rules from Firestore
    const { data: allRules } = useFirestore<Rule>('rules');
    const rules = (allRules || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

    // Fetch Categories from Firestore
    const { data: allCategories } = useFirestore<CategoryDef>('categories');
    const categories = (allCategories || []).filter(c => c.scope === scope || (scope === 'PERSONAL' && !c.scope));

    const [newRule, setNewRule] = useState<Partial<Rule>>({ matchType: "contains", active: true });

    const addRule = async () => {
        if (!user) return alert("Debes iniciar sesión");
        if (!newRule.pattern || !newRule.category) return;

        try {
            const ruleId = generateId();
            const ruleData = { ...newRule, id: ruleId, scope: scope } as Rule;
            const docRef = doc(db, 'users', user.uid, 'rules', ruleId);
            await setDoc(docRef, ruleData);

            // Reset
            setNewRule({ matchType: "contains", active: true, category: categories[0]?.name, pattern: "" });
        } catch (e) {
            console.error(e);
            alert("Error al guardar regla");
        }
    };

    const deleteRule = async (id: string) => {
        if (!user) return;
        if (!confirm("¿Eliminar regla?")) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'rules', id));
        } catch (e) {
            console.error(e);
            alert("Error al eliminar");
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <BrainCircuit size={18} className="text-indigo-600" /> Reglas de Automatización
            </h3>
            <p className="text-sm text-slate-500 mb-4">Las transacciones que contengan este texto se categorizarán automáticamente.</p>

            <div className="flex gap-2 mb-6 items-end">
                <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500">Patrón (Texto en descripción)</label>
                    <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder="Ej. Netflix"
                        value={newRule.pattern || ""}
                        onChange={e => setNewRule({ ...newRule, pattern: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500">Categoría</label>
                    <select
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        value={newRule.category || ""}
                        onChange={e => setNewRule({ ...newRule, category: e.target.value })}
                    >
                        <option value="">Seleccionar...</option>
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
                <button
                    onClick={addRule}
                    disabled={!user || !newRule.pattern}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold h-[38px] disabled:opacity-50"
                >
                    <Plus size={18} />
                </button>
            </div>

            <div className="space-y-2">
                {rules.map(r => (
                    <div key={r.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="font-mono bg-white px-2 py-1 rounded border border-slate-200 text-xs">"{r.pattern}"</span>
                            <span className="text-slate-400 text-xs">→</span>
                            <span className="font-bold text-slate-700">{r.category}</span>
                        </div>
                        <button onClick={() => deleteRule(r.id)} className="text-slate-400 hover:text-rose-600">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
