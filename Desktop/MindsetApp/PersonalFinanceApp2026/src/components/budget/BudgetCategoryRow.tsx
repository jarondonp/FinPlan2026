import React from 'react';
import { TrendingUp, Lock, CreditCard, Target } from 'lucide-react';
import { formatCurrency } from '../../utils';
import { InlineItemEditor } from './InlineItemEditor';
import { BudgetItem } from '../../types/budgetEditHistory';

interface CategoryData {
    category: string;
    spent: number;
    totalLimit: number;
    fixed: number;
    reserved: number;
    variable: number;
    reservationNotice?: string;
    details?: {
        fixed?: any[];
        reserved?: any[];
        variable?: any[];
    };
}

interface BudgetCategoryRowProps {
    category: CategoryData;
    isExpanded: boolean;
    isMonthClosed: boolean;
    detailView: { category: string; type: 'fixed' | 'reserved' | 'variable' } | null;
    editingCategory: { category: string; budgetType: 'fixed' | 'reserved' | 'variable' } | null;
    onToggleExpand: () => void;
    onSetDetailView: (view: { category: string; type: 'fixed' | 'reserved' | 'variable' } | null) => void;
    onUpdateVariable: (value: number) => void;
    onStartEdit: (budgetType: 'fixed' | 'reserved' | 'variable') => void;
    onSaveItems: (items: BudgetItem[], reason?: string) => Promise<void>;
    onCancelEdit: () => void;
}

export const BudgetCategoryRow: React.FC<BudgetCategoryRowProps> = ({
    category: cat,
    isExpanded,
    isMonthClosed,
    detailView,
    editingCategory,
    onToggleExpand,
    onSetDetailView,
    onUpdateVariable,
    onStartEdit,
    onSaveItems,
    onCancelEdit
}) => {
    const totalLimit = cat.totalLimit;
    const percentage = totalLimit > 0 ? (cat.spent / totalLimit) * 100 : 0;

    // Segment Percentages for Bar
    const pFixed = totalLimit > 0 ? (cat.fixed / totalLimit) * 100 : 0;
    const pReserve = totalLimit > 0 ? (cat.reserved / totalLimit) * 100 : 0;
    const pVariable = totalLimit > 0 ? (cat.variable / totalLimit) * 100 : 0;

    const isSpecialCategory = cat.category === "Metas de Patrimonio" || cat.category === "Servicio de Deuda";

    return (
        <div key={cat.category} className="hover:bg-slate-50 transition-colors">
            {/* Main Row */}
            <div
                className="p-4 cursor-pointer"
                onClick={onToggleExpand}
            >
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        {cat.category === "Metas de Patrimonio" && <TrendingUp size={16} className="text-indigo-600" />}
                        <span className={`font-bold ${cat.category === "Metas de Patrimonio" ? 'text-indigo-700' : 'text-slate-700'}`}>
                            {cat.category}
                        </span>
                    </div>
                    <div className="text-right">
                        <span className={`font-mono font-bold text-sm ${cat.spent > cat.totalLimit ? 'text-rose-600' : (cat.category === "Metas de Patrimonio" ? 'text-indigo-600' : 'text-slate-700')}`}>
                            {formatCurrency(cat.spent)}
                        </span>
                        <span className="text-xs text-slate-400 mx-1">/</span>
                        <span className="text-xs font-medium text-slate-500">{formatCurrency(cat.totalLimit)}</span>
                    </div>
                </div>

                {/* Stacked Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 relative flex overflow-hidden">
                    {/* Fixed - Dark Blue */}
                    <div className="bg-slate-700 h-full" style={{ width: `${pFixed}%` }} title={`Fijo: ${formatCurrency(cat.fixed)}`}></div>
                    {/* Reserved - Purple */}
                    <div className="bg-violet-500 h-full" style={{ width: `${pReserve}%` }} title={`Reserva: ${formatCurrency(cat.reserved)}`}></div>
                    {/* Variable - Green */}
                    <div className="bg-emerald-500 h-full" style={{ width: `${pVariable}%` }} title={`Variable: ${formatCurrency(cat.variable)}`}></div>

                    {/* Savings specialized bar color */}
                    {cat.category === "Metas de Patrimonio" && (
                        <div className="absolute inset-0 bg-indigo-500/10 animate-pulse pointer-events-none"></div>
                    )}

                    {/* Spending Marker Line */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-black z-10 shadow-[0_0_4px_rgba(0,0,0,0.5)]"
                        style={{ left: `${Math.min(percentage, 100)}%` }}
                        title={`Gastado: ${formatCurrency(cat.spent)}`}
                    ></div>
                </div>
            </div>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="px-4 pb-4 bg-slate-50/50 animate-in slide-in-from-top-1">
                    {/* Special categories: Metas de Patrimonio */}
                    {cat.category === "Metas de Patrimonio" ? (
                        <div className="bg-white rounded-xl border border-indigo-200 p-3 shadow-inner">
                            <h5 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-3 border-b border-indigo-100 pb-1 flex items-center gap-1">
                                <Target size={12} /> Metas de Ahorro Activas
                            </h5>
                            <div className="space-y-2">
                                {cat.details?.reserved?.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic text-center py-2">No hay metas activas este mes.</p>
                                ) : (
                                    cat.details?.reserved?.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center text-xs p-2 bg-indigo-50/50 hover:bg-indigo-100/50 rounded-lg group transition-colors border border-indigo-100">
                                            <span className="font-medium text-slate-700">{item.name}</span>
                                            <div className="text-right">
                                                <div className="font-mono font-bold text-indigo-700">{formatCurrency(item.amount)}</div>
                                                {item.notice && <div className="text-[10px] text-indigo-500 font-medium">{item.notice}</div>}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : cat.category === "Servicio de Deuda" ? (
                        /* Special categories: Servicio de Deuda */
                        <div className="bg-white rounded-xl border border-rose-200 p-3 shadow-inner">
                            <h5 className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-3 border-b border-rose-100 pb-1 flex items-center gap-1">
                                <CreditCard size={12} /> Deudas del Mes
                            </h5>
                            <div className="space-y-2">
                                {(() => {
                                    const allDebtItems = [
                                        ...(cat.details?.fixed || []),
                                        ...(cat.details?.reserved || [])
                                    ];

                                    return allDebtItems.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic text-center py-2">No hay pagos de deuda este mes.</p>
                                    ) : (
                                        allDebtItems.map((item: any) => (
                                            <div key={item.id} className="flex justify-between items-center text-xs p-2 bg-rose-50/50 hover:bg-rose-100/50 rounded-lg group transition-colors border border-rose-100">
                                                <span className="font-medium text-slate-700">{item.name}</span>
                                                <div className="text-right">
                                                    <div className="font-mono font-bold text-rose-700">{formatCurrency(item.amount)}</div>
                                                    {item.notice && <div className="text-[10px] text-rose-500 font-medium">{item.notice}</div>}
                                                </div>
                                            </div>
                                        ))
                                    );
                                })()}
                            </div>
                        </div>
                    ) : (
                        /* Normal categories */
                        <>
                            {/* Summary Boxes */}
                            <div className="flex gap-4 text-xs mb-3">
                                {/* Fixed */}
                                <div
                                    onClick={(e) => { e.stopPropagation(); onSetDetailView(detailView?.type === 'fixed' && detailView?.category === cat.category ? null : { category: cat.category, type: 'fixed' }); }}
                                    className={`flex-1 p-2 rounded border cursor-pointer transition-all ${detailView?.type === 'fixed' && detailView?.category === cat.category ? 'ring-2 ring-slate-400 bg-slate-200' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                                >
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1 flex items-center gap-1">
                                        <Lock size={10} /> Recurrente {cat.details?.fixed?.length > 0 && `(${cat.details.fixed.length})`}
                                    </label>
                                    <div className="font-mono font-bold text-slate-600">{formatCurrency(cat.fixed)}</div>
                                </div>

                                {/* Smart Reserve */}
                                <div
                                    onClick={(e) => { e.stopPropagation(); onSetDetailView(detailView?.type === 'reserved' && detailView?.category === cat.category ? null : { category: cat.category, type: 'reserved' }); }}
                                    className={`flex-1 p-2 rounded border cursor-pointer transition-all ${detailView?.type === 'reserved' && detailView?.category === cat.category ? 'ring-2 ring-violet-400 bg-violet-100' : 'bg-violet-50 border-violet-100 hover:bg-violet-100'}`}
                                >
                                    <label className="block text-[10px] uppercase text-violet-500 font-bold mb-1 flex items-center gap-1">
                                        <Lock size={10} /> Smart Reserve {cat.details?.reserved?.length > 0 && `(${cat.details.reserved.length})`}
                                    </label>
                                    <div className="font-mono font-bold text-violet-700">{formatCurrency(cat.reserved)}</div>
                                    {cat.reservationNotice && <div className="text-[9px] text-violet-500 font-medium mt-1">{cat.reservationNotice}</div>}
                                </div>

                                {/* Variable with Editor Button */}
                                <div className="flex-1 space-y-2">
                                    <div className="p-2 bg-white rounded border border-emerald-200 shadow-sm ring-2 ring-emerald-50">
                                        <div
                                            className="cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); onSetDetailView(detailView?.type === 'variable' && detailView?.category === cat.category ? null : { category: cat.category, type: 'variable' }); }}
                                        >
                                            <label className="block text-[10px] uppercase text-emerald-600 font-bold mb-1">
                                                Variable {cat.details?.variable?.length > 0 && `(${cat.details.variable.length})`}
                                            </label>
                                        </div>
                                        {isMonthClosed ? (
                                            <div className="font-mono font-bold text-slate-400">{formatCurrency(cat.variable)}</div>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <span className="text-slate-400">$</span>
                                                <input
                                                    type="number"
                                                    className="w-full bg-transparent font-bold text-slate-800 outline-none"
                                                    value={cat.variable}
                                                    onChange={(e) => onUpdateVariable(parseFloat(e.target.value) || 0)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Edit Button */}
                                    {!isMonthClosed && !editingCategory && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onStartEdit('variable'); }}
                                            className="w-full px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-300 transition-colors flex items-center justify-center gap-1"
                                        >
                                            ✏️ Editar Items
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Inline Editor */}
                            {editingCategory && editingCategory.category === cat.category && (
                                <InlineItemEditor
                                    category={cat.category}
                                    budgetType={editingCategory.budgetType}
                                    initialItems={cat.details?.variable || []}
                                    onSave={onSaveItems}
                                    onCancel={onCancelEdit}
                                />
                            )}

                            {/* Detail View */}
                            {detailView && detailView.category === cat.category && (
                                <div className="mt-3 bg-white rounded-lg border border-slate-200 p-3">
                                    <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                                        Detalle: {detailView.type === 'fixed' ? 'Gastos Recurrentes' : detailView.type === 'reserved' ? 'Smart Reserve' : 'Variable Manual'}
                                    </h5>
                                    <div className="space-y-1">
                                        {(cat.details?.[detailView.type] || []).length === 0 ? (
                                            <p className="text-xs text-slate-400 italic">Sin movimientos</p>
                                        ) : (
                                            (cat.details?.[detailView.type] || []).map((item: any) => (
                                                <div key={item.id} className="flex justify-between text-xs p-2 hover:bg-slate-50 rounded">
                                                    <span className="text-slate-700">{item.name}</span>
                                                    <div className="text-right">
                                                        <div className="font-mono font-bold">{formatCurrency(item.amount)}</div>
                                                        {item.notice && <div className="text-[10px] text-slate-500">{item.notice}</div>}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
