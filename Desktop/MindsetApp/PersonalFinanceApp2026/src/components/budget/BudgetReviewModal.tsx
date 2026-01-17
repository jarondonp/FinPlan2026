import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, ArrowRight, Wallet, PieChart } from 'lucide-react';
import { formatCurrency } from '../../utils';
import { db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

interface BudgetReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    scope: 'personal' | 'business';
    currentMonth: string; // YYYY-MM
}

interface BudgetComparison {
    category: string;
    planned: number;
    real: number;
    difference: number;
    itemsPlanned: any[];
    itemsReal: any[];
}

export const BudgetReviewModal: React.FC<BudgetReviewModalProps> = ({
    isOpen,
    onClose,
    userId,
    scope,
    currentMonth
}) => {
    const [comparisons, setComparisons] = useState<BudgetComparison[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadComparison();
        }
    }, [isOpen, userId, scope, currentMonth]);

    const loadComparison = async () => {
        setLoading(true);
        try {
            const { hybridBudgetService } = await import('../../services/HybridBudgetService');

            // Parse month string to Date object (first day of month)
            const [year, month] = currentMonth.split('-').map(Number);
            const date = new Date(year, month - 1, 1);

            // Parallel Fetch: Planned (Base) vs Real (Executed)
            const [realData, plannedData] = await Promise.all([
                hybridBudgetService.getBudgetBreakdown(date, scope.toUpperCase() as any),
                hybridBudgetService.calculatePlannedBudget(date, scope.toUpperCase() as any)
            ]);

            // Map to dictionary for easy lookup
            const plannedMap = new Map(plannedData.map(item => [item.category, item]));
            const realMap = new Map(realData.map(item => [item.category, item]));

            // specific logic for special categories names to ensure matching
            // (The service uses consistent names "Servicio de Deuda", "Metas de Patrimonio")

            // Get unique categories list from both sets
            const allCategories = Array.from(new Set([...plannedMap.keys(), ...realMap.keys()]));

            const comparisonList: BudgetComparison[] = allCategories.map(catName => {
                const planned = plannedMap.get(catName);
                const real = realMap.get(catName);

                // Collect Items
                // Planned items: Fixed + Reserved + Variable(Limit)
                const itemsPlanned = [
                    ...(planned?.details.fixed || []),
                    ...(planned?.details.reserved || []),
                    ...(planned?.details.variable || [])
                ];

                // Real items: Fixed + Reserved + Variable(Manual/Extras)
                const itemsReal = [
                    ...(real?.details.fixed || []),
                    ...(real?.details.reserved || []),
                    ...(real?.details.variable || [])
                ];

                const totalPlanned = planned?.totalLimit || 0;
                const totalReal = real?.totalLimit || 0;

                return {
                    category: catName,
                    planned: totalPlanned,
                    real: totalReal,
                    difference: totalReal - totalPlanned, // Positive means Over Budget/More than planned
                    itemsPlanned,
                    itemsReal
                };
            });

            // Sort by difference magnitude (or total magnitude)
            // Let's sort by highest Real spending for now
            comparisonList.sort((a, b) => b.real - a.real);

            setComparisons(comparisonList);
        } catch (error) {
            console.error("Error loading comparison", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-slate-200">

                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <PieChart className="text-emerald-600" />
                            Revisión de Presupuesto
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">
                            Comparativa Planificado vs Ejecutado • {currentMonth}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
                            <p>Calculando comparativa...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Panel: Category Summary List */}
                            <div className="lg:col-span-1 space-y-3 overflow-y-auto max-h-[70vh] pr-2">
                                <h3 className="font-bold text-slate-700 mb-2 px-1 sticky top-0 bg-white z-10">Categorías</h3>
                                {comparisons.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic p-4">No hay datos para comparar.</p>
                                ) : (
                                    comparisons.map((comp) => (
                                        <div
                                            key={comp.category}
                                            onClick={() => setSelectedCategory(comp.category)}
                                            className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedCategory === comp.category
                                                    ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                                                    : 'bg-white border-slate-200 hover:border-indigo-300'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-sm text-slate-700">{comp.category}</span>
                                                {Math.abs(comp.difference) > 1 && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${comp.difference > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                        {comp.difference > 0 ? '+' : ''}{formatCurrency(comp.difference)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>Plan: {formatCurrency(comp.planned)}</span>
                                                <span>Real: <span className="font-medium text-slate-800">{formatCurrency(comp.real)}</span></span>
                                            </div>
                                            {/* Mini Progres Bar */}
                                            <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${comp.real > comp.planned ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                                    style={{ width: `${comp.planned > 0 ? Math.min((comp.real / comp.planned) * 100, 100) : 0}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Right Panel: Side-by-Side Detail */}
                            <div className="lg:col-span-2 bg-slate-50 rounded-xl p-6 border border-slate-100 h-full flex flex-col max-h-[70vh]">
                                {selectedCategory ? (
                                    (() => {
                                        const comp = comparisons.find(c => c.category === selectedCategory);
                                        if (!comp) return null;

                                        return (
                                            <div className="flex-1 flex flex-col h-full">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                                        {comp.category}
                                                        {comp.difference !== 0 && (
                                                            <span className={`text-sm px-2 py-1 rounded bg-slate-200 text-slate-600`}>
                                                                Diferencia: {formatCurrency(comp.difference)}
                                                            </span>
                                                        )}
                                                    </h3>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
                                                    {/* Planned Column */}
                                                    <div className="flex flex-col h-full">
                                                        <div className="bg-slate-200 p-2 text-center rounded-t-lg font-bold text-slate-600 text-xs uppercase tracking-wider sticky top-0">
                                                            Planificado (Base)
                                                        </div>
                                                        <div className="bg-white flex-1 rounded-b-lg border border-slate-200 p-0 overflow-y-auto">
                                                            {comp.itemsPlanned.length === 0 ? (
                                                                <p className="text-center text-xs text-slate-400 italic p-4">Sin items planificados</p>
                                                            ) : (
                                                                <div className="divide-y divide-slate-100">
                                                                    {comp.itemsPlanned.map((item, idx) => (
                                                                        <div key={`${item.id}-${idx}`} className="p-3 text-xs flex justify-between hover:bg-slate-50">
                                                                            <span className="text-slate-600">{item.name}</span>
                                                                            <span className="font-mono font-medium">{formatCurrency(item.amount)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between font-bold text-xs sticky bottom-0">
                                                                <span>TOTAL BASE</span>
                                                                <span>{formatCurrency(comp.planned)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Real Column */}
                                                    <div className="flex flex-col h-full">
                                                        <div className="bg-emerald-600 p-2 text-center rounded-t-lg font-bold text-white text-xs uppercase tracking-wider sticky top-0 shadow-md">
                                                            Ejecutado (Real)
                                                        </div>
                                                        <div className="bg-white flex-1 rounded-b-lg border-2 border-emerald-100 p-0 overflow-y-auto relative">
                                                            {comp.itemsReal.length === 0 ? (
                                                                <p className="text-center text-xs text-slate-400 italic p-4">Sin items ejecutados</p>
                                                            ) : (
                                                                <div className="divide-y divide-emerald-50">
                                                                    {comp.itemsReal.map((item, idx) => (
                                                                        <div key={`${item.id}-${idx}`} className="p-3 text-xs flex justify-between hover:bg-emerald-50/50">
                                                                            <span className="text-slate-800 font-medium">{item.name}</span>
                                                                            <span className="font-mono font-bold text-emerald-700">{formatCurrency(item.amount)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="p-3 bg-emerald-50 border-t border-emerald-100 flex justify-between font-bold text-xs sticky bottom-0 text-emerald-800">
                                                                <span>TOTAL REAL</span>
                                                                <span>{formatCurrency(comp.real)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                        <Wallet size={48} className="mb-4 text-slate-300" />
                                        <p>Selecciona una categoría para comparar items.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
