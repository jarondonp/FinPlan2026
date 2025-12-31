import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { Rule } from '../../types';
import { generateId } from '../../utils';
import { BrainCircuit, X, Plus } from 'lucide-react';

export const RuleManager = () => {
    const rules = useLiveQuery(() => db.rules.toArray()) || [];
    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const [newRule, setNewRule] = useState<Partial<Rule>>({ matchType: "contains", active: true });

    const addRule = async () => {
        if (!newRule.pattern || !newRule.category) return;
        await db.rules.add({ ...newRule, id: generateId() } as Rule);
        setNewRule({ matchType: "contains", active: true, category: categories[0]?.name, pattern: "" });
    };

    const deleteRule = (id: string) => {
        db.rules.delete(id);
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
                <button onClick={addRule} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold h-[38px]">
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
